/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    Configuration,
    configurationValue,
    GitProject,
    HandlerContext,
    logger,
    Project,
    RemoteRepoRef,
} from "@atomist/automation-client";
import {
    execPromise,
    PreferenceStore,
    PushImpactListenerInvocation,
} from "@atomist/sdm";
import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import {
    Aspect,
    FP,
    VirtualProjectFinder,
} from "@atomist/sdm-pack-fingerprint";
import { toName } from "@atomist/sdm-pack-fingerprint/lib/adhoc/preferences";
import { Analyzed } from "../../../aspect/AspectRegistry";
import { time } from "../../../util/showTiming";
import {
    AspectBeingTracked,
    RepoBeingTracked,
} from "../../tracking/analysisTracker";
import {
    Analyzer,
    TimeRecorder,
} from "./Spider";

/**
 * Analyzer implementation that captures timings that are useful during
 * development, but don't need to be captured during regular execution.
 */
export class SpiderAnalyzer implements Analyzer {

    public readonly timings: TimeRecorder = {};

    public async analyze(p: Project, repoTracking: RepoBeingTracked): Promise<Analyzed> {
        const fingerprints: FP[] = [];

        if (this.virtualProjectFinder) {
            // Seed the virtual project finder if we have one
            await this.virtualProjectFinder.findVirtualProjectInfo(p);
        }
        const pili = await fakePushImpactListenerInvocation(p);
        await runExtracts(p, pili, this.aspects, fingerprints, this.timings, repoTracking);
        await runConsolidates(p, pili, this.aspects.filter(aspect => !!aspect.consolidate), fingerprints, repoTracking);

        return {
            id: p.id as RemoteRepoRef,
            fingerprints,
        };
    }

    constructor(private readonly aspects: Aspect[],
                private readonly virtualProjectFinder?: VirtualProjectFinder) {

    }
}

async function runExtracts(p: Project,
                           pili: PushImpactListenerInvocation,
                           aspects: Aspect[],
                           fingerprints: FP[],
                           timings: TimeRecorder,
                           repoTracking: RepoBeingTracked): Promise<void> {
    await Promise.all(aspects
        .map(aspect => safeTimedExtract(aspect, p, pili, timings, repoTracking.plan(aspect, "extract"))
            .then(fps =>
                fingerprints.push(...fps),
            )));
}

/**
 * This will run the consolidation aspects sequentially in order, passing in the result of previous consolidated fingerprints into
 * later aspects that consolidate.
 */
async function runConsolidates(p: Project,
                               pili: PushImpactListenerInvocation,
                               aspects: Aspect[],
                               fingerprints: FP[],
                               repoTracking: RepoBeingTracked): Promise<void> {
    for (const aspect of aspects) {
        const consolidatedFingerprints = await safeConsolidate(aspect, fingerprints, p, pili, repoTracking.plan(aspect, "consolidate"));
        fingerprints.push(...consolidatedFingerprints);
    }
}

async function safeTimedExtract(aspect: Aspect,
                                p: Project,
                                pili: PushImpactListenerInvocation,
                                timeRecorder: TimeRecorder,
                                tracking: AspectBeingTracked): Promise<FP[]> {
    try {
        const timed = await time(async () => {
            const fps = toArray(await aspect.extract(p, pili)) || [];
            fps.forEach(fp => {
                if (!fp.displayName && aspect.toDisplayableFingerprintName) {
                    fp.displayName = aspect.toDisplayableFingerprintName(toName(fp.type, fp.name));
                }
                if (!fp.displayValue && aspect.toDisplayableFingerprint) {
                    fp.displayValue = aspect.toDisplayableFingerprint(fp);
                }
                return fp;
            });
            return fps;
        });
        addTiming(aspect.name, timed.millis, timeRecorder);
        const result = !!timed.result ? toArray(timed.result) : [];
        tracking.completed(result.length);
        return result;
    } catch (err) {
        tracking.failed(err);
        logger.error("Please check your configuration of aspect %s.\n%s", aspect.name, err);
        return [];
    }
}

function addTiming(type: string, millis: number, timeRecorder: TimeRecorder): void {
    let found = timeRecorder[type];
    if (!found) {
        found = {
            extractions: 0,
            totalMillis: 0,
        };
        timeRecorder[type] = found;
    }
    found.extractions++;
    found.totalMillis += millis;
}

async function safeConsolidate(aspect: Aspect,
                               existingFingerprints: FP[],
                               p: Project,
                               pili: PushImpactListenerInvocation,
                               tracking: AspectBeingTracked): Promise<FP[]> {
    try {
        const extracted = await aspect.consolidate(existingFingerprints, p, pili);
        const result = !!extracted ? toArray(extracted) : [];
        tracking.completed(result.length);
        return result;
    } catch (err) {
        tracking.failed(err);
        logger.error("Please check your configuration of aspect %s.\n%s", aspect.name, err);
        return [];
    }
}

async function fetchChangedFiles(project: GitProject): Promise<string[]> {
    try {
        const output = await execPromise("git", ["show", `--pretty=format:""`, "--name-only"],
            { cwd: project.baseDir });
        return output.stdout.trim().split("\n");
    } catch (err) {
        logger.error("Failure getting changed files: %s", err.message);
        return [];
    }
}

/**
 * Make a fake push for the last commit to this project
 */
async function fakePushImpactListenerInvocation(p: Project): Promise<PushImpactListenerInvocation> {
    const project = p as GitProject;
    const changedFiles = await fetchChangedFiles(project);
    return {
        id: p.id as any,
        get context(): HandlerContext {
            logger.warn("Returning undefined context");
            return undefined;
        },
        commit: {
            sha: p.id.sha,
        },
        project,
        push: {
            repo: undefined,
            branch: "master",
        },
        addressChannels: async () => {
            logger.warn("Cannot say anything in local mode");
        },
        get filesChanged(): string[] {
            return changedFiles;
        },
        credentials: { token: process.env.GITHUB_TOKEN },
        impactedSubProject: p,
        get preferences(): PreferenceStore {
            logger.warn("Returning undefined preferences store");
            return undefined;
        },
        configuration: configurationValue<Configuration>("", {}),
    };
}
