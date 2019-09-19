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

import { InMemoryProject } from "@atomist/automation-client";
import {
    Aspect,
    fingerprintOf,
} from "@atomist/sdm-pack-fingerprint";
import * as assert from "assert";
import { SpiderAnalyzer } from "../../../../lib/analysis/offline/spider/SpiderAnalyzer";
import { RepoBeingTracked } from "../../../../lib/analysis/tracking/analysisTracker";

describe("SpiderAnalyzer", () => {
    describe("consolidation", () => {
        it("should use aspects created by earlier consolidating aspects", async () => {
            const aspect1: Aspect = {
                name: "test1",
                displayName: "test1",
                extract: async () => [],
                consolidate: async fps => {
                    return fingerprintOf({type: "test1fp", data: []});
                },
            };
            const aspect2: Aspect = {
                name: "test2",
                displayName: "test2",
                extract: async () => [],
                consolidate: async fps => {
                    if (fps.find(fp => fp.name === "test1fp")) {
                        return fingerprintOf({type: "test2fp", data: []});
                    } else {
                        return [];
                    }
                },
            };
            const spiderAnalyzer = new SpiderAnalyzer([aspect1, aspect2], undefined);
            const project = InMemoryProject.of();
            const analysis = await spiderAnalyzer.analyze(project, new RepoBeingTracked({description: "foo", repoKey: "bar"}));
            assert.strictEqual(analysis.fingerprints.length, 2);
            assert(analysis.fingerprints.some(fp => fp.type === "test1fp"));
            assert(analysis.fingerprints.some(fp => fp.type === "test2fp"));
        });
    });
});
