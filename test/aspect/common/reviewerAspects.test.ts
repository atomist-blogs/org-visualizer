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

import { InMemoryProject, NoParameters, ProjectReview } from "@atomist/automation-client";
import { CodeTransform } from "@atomist/sdm";
import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import { fingerprintOf } from "@atomist/sdm-pack-fingerprint";
import { CodeInspection } from "@atomist/sdm/lib/api/registration/CodeInspectionRegistration";
import * as assert from "assert";
import { reviewCommentCountAspect } from "../../../lib/aspect/common/reviewerAspect";

const FlagNothingReviewer: CodeInspection<ProjectReview, NoParameters> = async p => ({
    repoId: p.id,
    comments: [],
});

const AddFileTerminator: CodeTransform<NoParameters> = async p => {
    await p.addFile("foo", "bar");
};

describe("reviewCount aspects", () => {

    describe("extract", () => {

        it("should find count 0", async () => {
            const ra = reviewCommentCountAspect({
                reviewer: FlagNothingReviewer,
                name: "clean",
                displayName: "clean",
            });
            const fps = toArray(await ra.consolidate([], undefined, undefined));
            assert.strictEqual(fps.length, 1);
            assert.strictEqual(fps[0].data.count, 0);
        });
    });

    describe("apply", () => {

        it("should not emit apply function by default", async () => {
            const ra = reviewCommentCountAspect({
                reviewer: FlagNothingReviewer,
                name: "clean",
                displayName: "clean",
            });
            assert.strictEqual(ra.apply, undefined);
        });

        it("should emit apply function when terminator provided", async () => {
            const ra = reviewCommentCountAspect({
                reviewer: FlagNothingReviewer,
                name: "clean",
                displayName: "clean",
                terminator: AddFileTerminator,
            });
            assert(!!ra.apply);
        });

        it("apply function should reject non-zero target", async () => {
            const ra = reviewCommentCountAspect({
                reviewer: FlagNothingReviewer,
                name: "clean",
                displayName: "clean",
                terminator: AddFileTerminator,
            });
            const nonZeroFp = fingerprintOf({
                type: "clean",
                data: { count: 666 },
            });
            try {
                await ra.apply(InMemoryProject.of(), { parameters: { fp: nonZeroFp } } as any);
                assert.fail("Should have died");
            } catch {
                // Ok
            }
        });

        it("apply function should run with zero target", async () => {
            const ra = reviewCommentCountAspect({
                reviewer: FlagNothingReviewer,
                name: "clean",
                displayName: "clean",
                terminator: AddFileTerminator,
            });
            const zeroFp = fingerprintOf({
                type: "clean",
                data: { count: 0 },
            });
            const p = InMemoryProject.of();
            await ra.apply(p, { parameters: { fp: zeroFp } } as any);
            assert(await p.hasFile("foo"));
        });

    });

});
