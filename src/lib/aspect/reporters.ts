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

import { ReportBuilder } from "../tree/TreeBuilder";
import { Analyzed } from "./AspectRegistry";

/**
 * Implemented by objects that can report against a cohort of repos,
 * building a tree.
 */
export interface Reporter {
    summary: string;
    description: string;
    builder: ReportBuilder<Analyzed>;
}

/**
 * Implemented by object exposing reports we can run against aspects
 */
export type Reporters<A extends Analyzed = Analyzed> = Record<string, Reporter>;
