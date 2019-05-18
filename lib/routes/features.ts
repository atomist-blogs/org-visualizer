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

import { featureQueriesFrom } from "./featureQueries";
import { DefaultFeatureManager } from "../feature/DefaultFeatureManager";
import { TypeScriptVersionFeature } from "../feature/domain/TypeScriptVersionFeature";
import {
    NodeLibraryVersion,
    NodeLibraryVersionFeature,
} from "../feature/domain/NodeLibraryVersionFeature";
import { DockerBaseImageFeature } from "../feature/domain/DockerBaseImageFeature";
import { createAnalyzer } from "../machine/machine";
import { ManagedFeature } from "@atomist/sdm-pack-analysis";
import { SpecificDockerBaseImageFeature } from "../feature/domain/SpecificDockerBaseImageFeature";

export const features: Array<ManagedFeature<any, any>> = [
    new TypeScriptVersionFeature(),
    new DockerBaseImageFeature(),
    new SpecificDockerBaseImageFeature("node"),
    new NodeLibraryVersionFeature("@atomist/sdm"),
    new NodeLibraryVersionFeature("axios",  pa => !!pa.elements.node),
];

export const featureManager = new DefaultFeatureManager(
    ...features,
);
export const featureQueries = featureQueriesFrom(featureManager);