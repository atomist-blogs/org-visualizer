import { InMemoryProject } from "@atomist/automation-client";
import * as assert from "assert";
import { extractTypeScriptSourceDirectories } from "../../../lib/aspect/node/TypeScriptSourceDirectories";

describe("Figure out where people keep their TS source", () => {

    it("finds none in a project with no TS source", async () => {
        const p = InMemoryProject.of({ path: "index.js", content: "// some JS" });

        const extractedFingerprints = await extractTypeScriptSourceDirectories(p);
        assert.strictEqual(extractedFingerprints.length, 0);
    });
    it("finds directories with TS source", async () => {
        const p = InMemoryProject.of({ path: "index.ts", content: "// some TS" });

        const extractedFingerprints = await extractTypeScriptSourceDirectories(p);
        assert.strictEqual(extractedFingerprints.length, 1);
        const fp = extractedFingerprints[0];
        assert.deepEqual(fp.data, [{ dir: ".", tsFileCount: 1 }]);
    });
    it("puts directories with more TS source first", async () => {
        const p = InMemoryProject.of({ path: "index.ts", content: "// some TS" },
            { path: "src/whatever.ts", content: "// some TS" },
            { path: "src/more.ts", content: "// some TS" },
        );

        const extractedFingerprints = await extractTypeScriptSourceDirectories(p);
        assert.strictEqual(extractedFingerprints.length, 1);
        const fp = extractedFingerprints[0];
        assert.strictEqual(fp.data.length, 2);
        assert.deepEqual(fp.data[0], { dir: "src", tsFileCount: 2 });
    });
});
