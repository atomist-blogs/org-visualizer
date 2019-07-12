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
import { TypedFP } from "@atomist/sdm-pack-fingerprints";
import * as assert from "power-assert";
import {
    CodeOfConduct,
} from "../../lib/element/codeOfConduct";

describe("codeOfConductScanner", () => {

    it("should find no code of conduct", async () => {
        const p = InMemoryProject.of();
        const s = await CodeOfConduct.extract(p);
        assert(!s);
    });

    it("should find test code of conduct", async () => {
        const p = InMemoryProject.of({ path: "CODE_OF_CONDUCT.md", content: testCoC });
        const s = await CodeOfConduct.extract(p);
        assert(!!s);
        assert.strictEqual(s.data.content, testCoC);
        assert.strictEqual(s.data.title, "The Benign Code of Conduct");
    });

    it("should do its best with code of conduct without title", async () => {
        const p = InMemoryProject.of({ path: "CODE_OF_CONDUCT.md", content: "meaningless" });
        const s = await CodeOfConduct.extract(p);
        assert(!!s);
        assert.strictEqual(s.data.content, "meaningless");
        assert(!s.data.title);
    });

});

const testCoC = `# The Benign Code of Conduct

Be nice`;
