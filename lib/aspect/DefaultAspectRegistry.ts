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

import { FP } from "@atomist/sdm-pack-fingerprints";
import {
    AspectRegistry,
    ManagedAspect,
    Tag,
} from "./AspectRegistry";

import { ScoreWeightings } from "@atomist/sdm-pack-analysis";
import * as _ from "lodash";
import { ProjectAnalysisResult } from "../analysis/ProjectAnalysisResult";
import { TagContext } from "../routes/api";
import { tagRepos } from "../routes/support/tagUtils";
import {
    RepositoryScorer,
    ScoredRepo,
    scoreRepos,
} from "../scorer/scoring";
import { IdealStore } from "./IdealStore";
import {
    chainUndesirableUsageCheckers, ProblemStore,
    problemStoreBackedUndesirableUsageCheckerFor,
    UndesirableUsageChecker
} from "./ProblemStore";

/**
 * Determine zero or one tag in this fingerprint
 */
export interface Tagger extends Tag {

    test(fp: FP, tagContext: TagContext): boolean;
}

/**
 * Determine zero or one tag from this set of fingerprints
 */
export interface CombinationTagger extends Tag {

    test(fp: FP[], tagContext: TagContext): boolean;
}

/**
 * Aspects must have unique names
 */
export class DefaultAspectRegistry implements AspectRegistry {

    private readonly taggers: Tagger[] = [];

    private readonly combinationTaggers: CombinationTagger[] = [];

    /**
     * Create an index on this aspect. Must return a unique string. It's associated with a usage
     * not an aspect.
     */
    public withTaggers(...taggers: Tagger[]): this {
        this.taggers.push(...taggers);
        return this;
    }

    public withCombinationTaggers(...taggers: CombinationTagger[]): this {
        this.combinationTaggers.push(...taggers);
        return this;
    }

    public tagsFor(fp: FP, tagContext: TagContext): Tag[] {
        return _.uniqBy(this.taggers
                .map(tagger => ({ ...tagger, tag: tagger.test(fp, tagContext) }))
                .filter(t => !!t.tag),
            tag => tag.name);
    }

    public combinationTagsFor(fps: FP[], tagContext: TagContext): Tag[] {
        return _.uniqBy(this.combinationTaggers
                .map(tagger => ({ ...tagger, tag: tagger.test(fps, tagContext) }))
                .filter(t => !!t.tag),
            tag => tag.name);
    }

    public async tagAndScoreRepos(repos: ProjectAnalysisResult[]): Promise<ScoredRepo[]> {
        return scoreRepos(
            this.scorers,
            tagRepos(this, {
                repoCount: repos.length,
                // TODO fix this
                averageFingerprintCount: -1,
            }, repos),
        this.opts.scoreWeightings);
    }

    get availableTags(): Tag[] {
        return _.uniqBy(
            [...this.taggers, ...this.combinationTaggers],
            tag => tag.name);
    }

    get aspects(): ManagedAspect[] {
        return this.opts.aspects;
    }

    public aspectOf(type: string): ManagedAspect | undefined {
        return type ? this.aspects.find(f => f.name === type) : undefined;
    }

    public async undesirableUsageCheckerFor(workspaceId: string): Promise<UndesirableUsageChecker> {
        // TODO going for check functions is inelegant
        return chainUndesirableUsageCheckers(
            (await problemStoreBackedUndesirableUsageCheckerFor(this.problemStore, workspaceId)).check,
            this.opts.undesirableUsageChecker.check);
    }

    get idealStore(): IdealStore {
        return this.opts.idealStore;
    }

    get problemStore(): ProblemStore {
        return this.opts.problemStore;
    }

    get scorers(): RepositoryScorer[] {
        return this.opts.scorers || [];
    }

    constructor(private readonly opts: {
        idealStore: IdealStore,
        problemStore: ProblemStore,
        aspects: ManagedAspect[],
        undesirableUsageChecker: UndesirableUsageChecker,
        scorers?: RepositoryScorer[],
        scoreWeightings?: ScoreWeightings,
    }) {
        opts.aspects.forEach(f => {
            if (!f) {
                throw new Error("A null aspect was passed in");
            }
        });
    }
}

export function defaultedToDisplayableFingerprintName(aspect?: ManagedAspect): (fingerprintName: string) => string {
    return (aspect && aspect.toDisplayableFingerprintName) || (name => name);
}

export function defaultedToDisplayableFingerprint(aspect?: ManagedAspect): (fpi: FP) => string {
    return (aspect && aspect.toDisplayableFingerprint) || (fp => fp && fp.data);
}
