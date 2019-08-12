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

import { LeinDeps } from "@atomist/sdm-pack-clojure/lib/fingerprints/clojure";
import {
    DockerfilePath,
    DockerFrom,
    DockerPorts,
} from "@atomist/sdm-pack-docker";
import {
    fileNamesVirtualProjectFinder,
    filesAspect,
    makeVirtualProjectAware,
    NpmDeps,
    VirtualProjectFinder,
} from "@atomist/sdm-pack-fingerprints";
import { ManagedAspect } from "../aspect/AspectRegistry";
import { CodeMetricsAspect } from "../aspect/common/codeMetrics";
import { CodeOwnership } from "../aspect/common/codeOwnership";
import { fileCount } from "../aspect/common/fileCount";
import {
    CiAspect,
    JavaBuild,
    StackAspect,
} from "../aspect/common/stackAspect";
import { CodeOfConduct } from "../aspect/community/codeOfConduct";
import { License } from "../aspect/community/license";
import { conditionalize } from "../aspect/compose/conditionalize";
import { globAspect } from "../aspect/compose/globAspect";
import { branchCount } from "../aspect/git/branchCount";
import {
    gitActiveCommitters,
    GitRecency,
} from "../aspect/git/gitActivity";
import { idealsFromNpm } from "../aspect/node/idealFromNpm";
import { TsLintPropertyAspect } from "../aspect/node/TsLintAspect";
import { TypeScriptVersion } from "../aspect/node/TypeScriptVersion";
import { PythonDependencies } from "../aspect/python/pythonDependencies";
import { ExposedSecrets } from "../aspect/secret/exposedSecrets";
import { DirectMavenDependencies } from "../aspect/spring/directMavenDependencies";
import { SpringBootStarter } from "../aspect/spring/springBootStarter";
import { SpringBootVersion } from "../aspect/spring/springBootVersion";
import { TravisScriptsAspect } from "../aspect/travis/travisAspects";

const virtualProjectFinder: VirtualProjectFinder = fileNamesVirtualProjectFinder(
    "package.json", "pom.xml", "build.gradle", "requirements.txt",
);

/**
 * The aspects managed by this SDM.
 * Modify this list to customize with your own aspects.
 */
export const Aspects: ManagedAspect[] = [
    DockerFrom,
    DockerfilePath,
    DockerPorts,
    License,
    SpringBootStarter,
    TypeScriptVersion,
    new CodeOwnership(),
    {
        ...NpmDeps,
        suggestedIdeals: (type, name) => idealsFromNpm(name),
    },
    CodeOfConduct,
    ExposedSecrets,
    {
        ...new TsLintPropertyAspect(),
        // Deliberately suppress display until we figure out how to make this aspect more useful.
        // There is a useful tag from it
        displayName: undefined,
    },
    TravisScriptsAspect,
    fileCount,
    branchCount,
    GitRecency,
    // This is expensive as it requires deeper cloning
    // gitActiveCommitters(30),
    // This is also expensive
    CodeMetricsAspect,
    StackAspect,
    CiAspect,
    JavaBuild,
    conditionalize(filesAspect({
            name: "node-gitignore",
            displayName: "Node git ignore",
            type: "node-gitignore",
            toDisplayableFingerprint: fp => fp.sha,
            canonicalize: c => c,
        }, ".gitignore",
    ), async p => p.hasFile("package.json")),
    conditionalize(filesAspect({
            name: "spring-gitignore",
            displayName: "git ignore",
            type: "spring-gitignore",
            toDisplayableFingerprint: fp => fp.sha,
            canonicalize: c => c,
        }, ".gitignore",
    ), async p => p.hasFile("pom.xml")),
    // Don't show these
    globAspect({ name: "csproject", displayName: undefined, glob: "*.csproj" }),
    globAspect({ name: "snyk", displayName: undefined, glob: ".snyk" }),
    globAspect({ name: "changelog", displayName: undefined, glob: "CHANGELOG.md" }),
    globAspect({ name: "contributing", displayName: undefined, glob: "CONTRIBUTING.md" }),
    globAspect({ name: "azure-pipelines", glob: undefined, displayName: "Azure pipeline" }),

    SpringBootVersion,
    // allMavenDependenciesAspect,    // This is expensive
    DirectMavenDependencies,
    PythonDependencies,
    LeinDeps,
].map(aspect => makeVirtualProjectAware(aspect, virtualProjectFinder));
