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

import { PostgresProjectAnalysisResultStore } from "../lib/analysis/offline/persist/PostgresProjectAnalysisResultStore";
import { sdmConfigClientFactory } from "../lib/analysis/offline/persist/pgClientFactory";
import * as assert from "power-assert";
import { ProjectAnalysisResult } from "../lib/analysis/ProjectAnalysisResult";
import { FP } from "@atomist/sdm-pack-fingerprint";
import { fingerprintsToReposTreeQuery, driftTreeForAllAspects } from "../lib/analysis/offline/persist/repoTree";

describe("Postgres Result Store", () => {
    it("does something", async () => {
        const subject = new PostgresProjectAnalysisResultStore(sdmConfigClientFactory({}));

        const workspaceId1 = "TJVC";
        const workspaceId2 = "ARGO";
        const fingerprintToStore: FP<any> = {
            type: "MST3k",
            name: "Rowsdower",
            displayName: "The Loyal Traitor",
            sha: "8x4d",
            data: { yell: "ROWSDOWER!!!" },
            path: "/hey"
        }
        const repoRef = {
            owner: "satellite-of-love",
            repo: "rowsdower",
            url: "https://github.com/satellite-of-love/rowsdower",
            sha: "dead0x",
        };
        const analysis: ProjectAnalysisResult = {
            repoRef,
            workspaceId: workspaceId1,
            timestamp: new Date(),
            analysis: {
                id: repoRef,
                fingerprints: [fingerprintToStore]
            }
        };

        const persistResult = await subject.persist(analysis);

        // Spot persistence failures early
        console.log(JSON.stringify(persistResult, null, 2));
        assert.strictEqual(persistResult.failed.length, 0, "Failures: " + persistResult.failed.map(f => f.message).join(", "));
        assert.strictEqual(persistResult.failedFingerprints.length, 0,
            "Failures: " + persistResult.failedFingerprints.map(f => f.error).join(", "));
        assert(persistResult.succeeded.length > 0, "reports something was persisted");

        // retrieve
        const distinct = false;
        const allFingerprintsInWorkspace = await subject.fingerprintsInWorkspace(workspaceId1, distinct);

        assert.strictEqual(allFingerprintsInWorkspace.length, 1);
        const retrievedFingerprint = allFingerprintsInWorkspace[0];
        assert.deepEqual(retrievedFingerprint, fingerprintToStore);

        //  const loadedByRepoRef = await subject.loadByRepoRef();

        // const loadedById = await subject.loadById();

        // analyze, to get the fingerprint_analytics populated
        // const fingerprintUsage = await subject.fingerprintUsageForType()

        // // this has to be used somewhere
        // const ftrTreeQueryResult = await fingerprintsToReposTreeQuery();

        // // and the drift tree
        // const driftTreeResult = await driftTreeForAllAspects();

        // const kinds = await subject.distinctFingerprintKinds();

        // subject.deleteOldSnapshotForRepository();

        // subject.fingerprintsForProject();

        // subject.averageFingerprintCount();

        // subject.distinctRepoFingerprintKinds();


    })
})