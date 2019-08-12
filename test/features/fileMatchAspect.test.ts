import { InMemoryProject } from "@atomist/automation-client";
import {
    FileMatchData,
    microgrammarMatchAspect,
} from "../../lib/aspect/compose/fileMatchAspect";

import * as assert from "assert";

import { microgrammar } from "@atomist/microgrammar";
import { FP } from "@atomist/sdm-pack-fingerprints";

describe("fileMatchAspect", () => {

    describe("microgrammarMatchAspect", () => {

        it("should not match in empty project", async () => {
            const p = InMemoryProject.of();
            const aspect = microgrammarMatchAspect({
                name: "foo",
                displayName: "foo",
                glob: "thing",
                grammar: microgrammar({
                    name: /.*/,
                }),
                path: "name",
            });
            const r = await aspect.extract(p) as FP<FileMatchData>;
            assert(r !== undefined);
            assert.strictEqual(r.data.matches.length, 0, JSON.stringify(r));
        });

        it("should not match in file with no match", async () => {
            const p = InMemoryProject.of({
                path: "thing",
                content: "whatever",
            });
            const aspect = microgrammarMatchAspect({
                name: "foo",
                displayName: "foo",
                glob: "thing",
                grammar: microgrammar({
                    name: "_",
                    age: /[0-9]+/,
                    end: "_",
                }),
                path: "age",
            });
            const r = await aspect.extract(p) as FP<FileMatchData>;
            assert(r !== undefined);
            assert.strictEqual(r.data.matches.length, 0, JSON.stringify(r));
        });

        it("should match in file with match", async () => {
            const p = InMemoryProject.of({
                path: "thing",
                content: "_25_",
            });
            const aspect = microgrammarMatchAspect({
                name: "foo",
                displayName: "foo",
                glob: "thing",
                grammar: microgrammar({
                    name: "_",
                    age: /[0-9]+/,
                    end: "_",
                }),
                path: "age",
            });
            const r = await aspect.extract(p) as FP<FileMatchData>;
            assert.strictEqual(r.data.matches.length, 1);
            assert.strictEqual(r.data.matches[0].matchValue, "25");
        });

        it("should match real world example", async () => {
            const content = `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>netcoreapp2.2</TargetFramework>
  </PropertyGroup>

</Project>`;

            const grammar = microgrammar({
                _open: /<TargetFrameworks?>/,
                targetFramework: /[a-zA-Z0-9_;/.]+/,
                _close: /<\/TargetFrameworks?>/,
            });

            const parsed = grammar.findMatches(content);
            assert.strictEqual(parsed.length, 1);

            const p = InMemoryProject.of({
                path: "thing.csproj",
                content,
            });
            const aspect = microgrammarMatchAspect({
                name: "foo",
                displayName: "foo",
                glob: "*.csproj",
                grammar,
                path: "targetFramework",
            });
            const r = await aspect.extract(p) as FP<FileMatchData>;
            assert.strictEqual(r.data.matches.length, 1);
            assert.strictEqual(r.data.matches[0].matchValue, "netcoreapp2.2");
        });
    });

});
