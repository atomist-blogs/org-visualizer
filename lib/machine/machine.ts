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

import { VirtualProjectFinder } from "@atomist/sdm-pack-fingerprint";
import { Aspect } from "@atomist/sdm-pack-fingerprint/lib/machine/Aspect";
import { ClientFactory } from "../analysis/offline/persist/pgUtils";
import { PostgresProjectAnalysisResultStore } from "../analysis/offline/persist/PostgresProjectAnalysisResultStore";
import { ProjectAnalysisResultStore } from "../analysis/offline/persist/ProjectAnalysisResultStore";
import { Analyzer } from "../analysis/offline/spider/Spider";
import { SpiderAnalyzer } from "../analysis/offline/spider/SpiderAnalyzer";

/**
 * Create the analyzer used for spidering repos.
 * @return {Analyzer}
 */
export function createAnalyzer(aspects: Aspect[], virtualProjectFinder: VirtualProjectFinder): Analyzer {
    return new SpiderAnalyzer(aspects, virtualProjectFinder);
}

export function analysisResultStore(factory: ClientFactory): ProjectAnalysisResultStore {
    return new PostgresProjectAnalysisResultStore(factory);
}
