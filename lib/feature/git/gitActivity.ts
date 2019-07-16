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

import { LocalProject, logger } from "@atomist/automation-client";
import {
    ExtractFingerprint,
    Feature,
    sha256,
} from "@atomist/sdm-pack-fingerprints";
import * as child_process from "child_process";
import * as util from "util";
import { daysSince } from "./dateUtils";

const exec = util.promisify(child_process.exec);

const gitLastCommitCommand = "git log -1 --format=%cd --date=short";

const gitRecencyExtractor: ExtractFingerprint =
    async p => {
        const r = await exec(gitLastCommitCommand, { cwd: (p as LocalProject).baseDir });
        if (!r.stdout) {
            return undefined;
        }
        const data = new Date(r.stdout.trim());

        return {
            type: "git-recency",
            name: "git-recency",
            data,
            sha: sha256(JSON.stringify(data)),
        };
    };

/**
 * Classify since last commit
 */
export const GitRecency: Feature = {
    name: "git-recency",
    displayName: "Recency of git activity",
    extract: gitRecencyExtractor,
    toDisplayableFingerprintName: () => "Recency of git activity",
    toDisplayableFingerprint: fp => {
        const date = new Date(fp.data);
        return lastDateToActivityBand(date);
    },
};

function committersCommands(commitDepth: number): string[] {
    return [
        `git fetch --depth=${commitDepth}`,
        `git shortlog -s -n --all --max-count ${commitDepth}`,
    ];
}

function activeCommittersExtractor(commitDepth: number): ExtractFingerprint {
    return async p => {
        const cwd = (p as LocalProject).baseDir;
        const cmds = committersCommands(commitDepth);
        logger.debug("Running commands %s in %s", cwd, cmds);
        await exec(cmds[0], { cwd });
        const r = await exec(cmds[1], { cwd });
        if (!r.stdout) {
            return undefined;
        }
        const count = r.stdout.trim().split("\n").length;
        const data = { count };

        return {
            type: "git-actives",
            name: "git-actives",
            data,
            sha: sha256(JSON.stringify(data)),
        };
    };
}

/**
 * Active committers. This is expensive as it requires cloning the
 * last commitDepth commits
 */
export function gitActiveCommitters(commitDepth: number): Feature {
    return {
        name: "git-actives",
        displayName: "Active git committers",
        extract: activeCommittersExtractor(commitDepth),
        toDisplayableFingerprintName: () => "Active git committers",
        toDisplayableFingerprint: fp => {
            return fp.data.count + "";
        },
    };
}

// export const gitActivityExtractor: ExtractFingerprint =
//     async p => {
//         // TODO make this reusable so we can see for default branch and all others
//         const r = await exec(sinceDays(7), { cwd: (p as LocalProject).baseDir });
//         if (!r.stdout) {
//             return undefined;
//         }
//         const last7 = parseInt(r.stdout.trim(), 10);
//
//         return {
//             type: "git-activity"
//             name: "gitActivity",
//             last7,
//         };
//     };

/**
 * Return a command
 * @param {number} days
 * @return {string}
 */
function sinceDays(days: number): string {
    return `git log --all --since=${days}.days --pretty=oneline | wc -l`;
}

function lastDateToActivityBand(date: Date): string {
    const days = daysSince(date);
    if (days > 500) {
        return "prehistoric";
    }
    if (days > 365) {
        return "ancient";
    }
    if (days > 30) {
        return "slow";
    }
    return "active";
}
