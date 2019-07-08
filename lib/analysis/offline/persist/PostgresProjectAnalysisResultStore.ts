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
import { ProjectAnalysis } from "@atomist/sdm-pack-analysis";
import { Ideal, isConcreteIdeal } from "@atomist/sdm-pack-fingerprints";
import { Client } from "pg";
import {
    Analyzed,
    HasFingerprints, IdealStore,
} from "../../../feature/FeatureManager";
import {
    isProjectAnalysisResult,
    ProjectAnalysisResult,
} from "../../ProjectAnalysisResult";
import { SpideredRepo } from "../SpideredRepo";
import {
    ClientFactory,
    doWithClient,
} from "./pgUtils";
import {
    combinePersistResults,
    emptyPersistResult,
    PersistResult,
    ProjectAnalysisResultStore,
} from "./ProjectAnalysisResultStore";

export class PostgresProjectAnalysisResultStore implements ProjectAnalysisResultStore, IdealStore {

    public count(): Promise<number> {
        return doWithClient(this.clientFactory, async client => {
            const rows = await client.query("SELECT COUNT(1) as c from repo_snapshots");
            return rows[0].c;
        });
    }

    public loadWhere(where: string): Promise<ProjectAnalysisResult[]> {
        return doWithClient(this.clientFactory, async client => {
            const sql = `SELECT id, owner, name, url, commit_sha, analysis, timestamp
                from repo_snapshots ` +
                (where ? `WHERE ${where}` : "");
            const rows = await client.query(sql);
            return rows.rows;
        });
    }

    public async loadById(id: string): Promise<ProjectAnalysisResult> {
        return doWithClient(this.clientFactory, async client => {
            const result = await client.query(`SELECT owner, name, url, commit_sha, analysis, timestamp
                FROM repo_snapshots
                WHERE id = $1`, [id]);
            return result.rows.length === 1 ? {
                id,
                analysis: result.rows[0].analysis,
                timestamp: result.rows[0].timestamp,
                workspaceId: result.rows[0].workspace_id,
            } : undefined;
        });
    }

    public async loadByRepoRef(repo: RepoRef): Promise<ProjectAnalysisResult> {
        return doWithClient(this.clientFactory, async client => {
            const result = await client.query(`SELECT id, owner, name, url, commit_sha, analysis, timestamp
                FROM repo_snapshots
                WHERE owner = $1 AND name = $2 AND commit_sha = $3`, [repo.owner, repo.repo, repo.sha]);
            return result.rows.length >= 1 ? {
                id: result.rows[0].id,
                analysis: result.rows[0].analysis,
                timestamp: result.rows[0].timestamp,
                workspaceId: result.rows[0].workspace_id,
            } : undefined;
        });
    }

    public async persist(repos: ProjectAnalysisResult | AsyncIterable<ProjectAnalysisResult> | ProjectAnalysisResult[]): Promise<PersistResult> {
        return this.persistAnalysisResults(isProjectAnalysisResult(repos) ? [repos] : repos);
    }

    public async storeIdeal(workspaceId: string, ideal: Ideal): Promise<void> {
        if (isConcreteIdeal(ideal)) {
            await doWithClient(this.clientFactory, async client => {
                const id = workspaceId + "_" + ideal.ideal.type + "_" + ideal.ideal.name;
                await client.query(`INSERT INTO ideal_fingerprints (workspace_id, id, name, feature_name, sha, data)
values ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
`, [workspaceId, id, ideal.ideal.name, ideal.ideal.type, ideal.ideal.sha, JSON.stringify(ideal.ideal.data)]);
            });
        } else {
            throw new Error("Elimination ideals not yet supported");
        }
    }

    public async fetchIdeal(workspaceId: string, type: string, name: string): Promise<Ideal> {
        const rawRow = await doWithClient(this.clientFactory, async client => {
            const rows = await client.query(`SELECT id, name, feature_name as type, sha, data FROM ideal_fingerprints
            WHERE workspace_id = $1 AND feature_name = $2 AND name = $3)`, [workspaceId, type, name]);
            return rows.rows.length === 1 ? rows.rows[0] : undefined;
        });
        if (!rawRow) {
            return undefined;
        }
        if (!!rawRow.data) {
            return {
                ideal: rawRow,
                reason: `Local database row ${rawRow.id}`,
            };
        }
        throw new Error("Elimination ideals not yet supported");
    }

    private async persistAnalysisResults(
        analysisResultIterator: AsyncIterable<ProjectAnalysisResult> | ProjectAnalysisResult[]): Promise<PersistResult> {
        const persistResults: PersistResult[] = [];
        return doWithClient(this.clientFactory, async client => {
            for await (const analysisResult of analysisResultIterator) {
                if (!analysisResult.analysis) {
                    throw new Error("Analysis is undefined!");
                }
                persistResults.push(await this.persistOne(client, analysisResult));
            }
            return persistResults.reduce(combinePersistResults, emptyPersistResult);
        });
    }

    private async persistOne(client: Client, analysisResult: ProjectAnalysisResult): Promise<PersistResult> {
        const repoRef = analysisResult.analysis.id;
        if (!repoRef) {
            return {
                attemptedCount: 1,
                succeeded: [],
                failed: [{
                    repoUrl: "missing repoRef",
                    whileTryingTo: "build object to persist",
                    message: "No RepoRef",
                }],
            };
        }
        if (!repoRef.url || !repoRef.sha) {
            return {
                attemptedCount: 1,
                succeeded: [],
                failed: [{
                    repoUrl: "missing repoUrl. Repo is named " + repoRef.repo,
                    whileTryingTo: "build object to persist",
                    message: `Incomplete RepoRef ${JSON.stringify(repoRef)}`,
                }],
            };
        }

        // Use this as unique database id
        const id = repoRef.url.replace("/", "") + "_" + repoRef.sha;

        try {
            // Whack any joins
            await client.query(`DELETE from repo_fingerprints WHERE repo_snapshot_id = $1`, [id]);
            await client.query(`DELETE from repo_snapshots WHERE id = $1`, [id]);

            const shaToUse = !!(analysisResult.analysis as ProjectAnalysis).gitStatus ?
                (analysisResult.analysis as ProjectAnalysis).gitStatus.sha :
                repoRef.sha;
            await client.query(`
            INSERT INTO repo_snapshots (id, workspace_id, provider_id, owner, name, url, commit_sha, analysis, query, timestamp)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, current_timestamp)`,
                [id,
                    analysisResult.workspaceId,
                    "github",
                    repoRef.owner,
                    repoRef.repo,
                    repoRef.url,
                    shaToUse,
                    analysisResult.analysis,
                    (analysisResult as SpideredRepo).query,
                ]);
            await this.persistFingerprints(analysisResult.analysis, id, client);

            return {
                succeeded: [id],
                attemptedCount: 1,
                failed: [],
            };
        } catch (err) {
            return {
                attemptedCount: 1,
                succeeded: [],
                failed: [{
                    repoUrl: repoRef.url,
                    whileTryingTo: "persist in DB",
                    message: err.message,
                }],
            };
        }
    }

    // Persist the fingerprints for this analysis
    private async persistFingerprints(pa: Analyzed, id: string, client: Client): Promise<void> {
        for (const fp of pa.fingerprints) {
            const featureName = fp.type || "unknown";
            const fingerprintId = featureName + "_" + fp.name + "_" + fp.sha;
            //  console.log("Persist fingerprint " + JSON.stringify(fp) + " for id " + id);
            // Create fp record if it doesn't exist
            await client.query(`INSERT INTO fingerprints (id, name, feature_name, sha, data)
values ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
`, [fingerprintId, fp.name, featureName, fp.sha, JSON.stringify(fp.data)]);
            await client.query(`INSERT INTO repo_fingerprints (repo_snapshot_id, fingerprint_id)
values ($1, $2) ON CONFLICT DO NOTHING
`, [id, fingerprintId]);
        }
    }

    constructor(public readonly clientFactory: ClientFactory) {
    }

}
