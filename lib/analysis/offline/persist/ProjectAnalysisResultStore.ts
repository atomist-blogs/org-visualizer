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

import { RepoRef } from "@atomist/automation-client";
import { FP } from "@atomist/sdm-pack-fingerprints";
import { ProjectAnalysisResult } from "../../ProjectAnalysisResult";
import {
    PersistenceResult,
    SpiderFailure,
} from "../spider/Spider";
import { CohortAnalysis } from "../../../tree/sunburst";

export interface PersistResult {
    attemptedCount: number;
    failed: SpiderFailure[];
    succeeded: PersistenceResult[];
}

export function combinePersistResults(r1: PersistResult, r2: PersistResult): PersistResult {
    return {
        attemptedCount: r1.attemptedCount + r2.attemptedCount,
        failed: [...r1.failed, ...r2.failed],
        succeeded: [...r1.succeeded, ...r2.succeeded],
    };
}

export const emptyPersistResult: PersistResult = {
    attemptedCount: 0,
    failed: [],
    succeeded: [],
};

export type FingerprintKind = Pick<FP, "type" | "name">;

/**
 * Data about the use of a fingerprint in a workspace
 */
export interface FingerprintUsage extends CohortAnalysis {
    name: string;
    type: string;
    categories: string[];
}

/**
 * Interface for basic persistence operations.
 * Implementations can provide additional querying options,
 * e.g. through SQL.
 */
export interface ProjectAnalysisResultStore {

    /**
     * How many analyses we have stored. This includes multiple analyses of the same repo.
     * @return {Promise<number>}
     */
    count(): Promise<number>;

    /**
     * Where e.g. workspace_id = value
     * @param {string} where SQL where clause
     * @return {Promise<ProjectAnalysisResult[]>}
     */
    loadWhere(where: string): Promise<ProjectAnalysisResult[]>;

    loadByRepoRef(repo: RepoRef): Promise<ProjectAnalysisResult | undefined>;

    /**
     * Load by our database id
     * @param {string} id
     * @return {Promise<ProjectAnalysisResult | undefined>}
     */
    loadById(id: string): Promise<ProjectAnalysisResult | undefined>;

    persist(repos: ProjectAnalysisResult | AsyncIterable<ProjectAnalysisResult> | ProjectAnalysisResult[]): Promise<PersistResult>;

    /**
     * Return distinct fingerprint type/name combinations in this workspace
     */
    distinctFingerprintKinds(workspaceId: string): Promise<FingerprintKind[]>;

    fingerprintUsageForType(workspaceId: string, type?: string): Promise<FingerprintUsage[]>;

    computeAnalyticsForFingerprintKind(workspaceId: string, type: string, name: string): Promise<void>;

    /**
     * Compute all analytics for this workspace. Slow but only used locally for spidering.
     * @param {string} workspaceId
     * @return {Promise<void>}
     */
    computeAnalytics(workspaceId: string): Promise<void>;

    /**
     * Return all the fingerprints in this workspace, optionally narrowed by type and name
     */
    fingerprintsInWorkspace(
        workspaceId: string,
        type?: string,
        name?: string): Promise<FP[]>;
}
