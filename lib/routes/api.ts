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

import { FingerprintData, logger } from "@atomist/automation-client";
import { ExpressCustomizer } from "@atomist/automation-client/lib/configuration";
import {
    Feature,
    FP,
} from "@atomist/sdm-pack-fingerprints";
import * as bodyParser from "body-parser";
import {
    Express,
    RequestHandler,
} from "express";
import * as _ from "lodash";
import {
    ClientFactory,
    doWithClient,
} from "../analysis/offline/persist/pgUtils";
import { ProjectAnalysisResultStore } from "../analysis/offline/persist/ProjectAnalysisResultStore";
import { getCategories } from "../customize/categories";
import { fingerprintsFrom } from "../feature/DefaultFeatureManager";
import {
    FeatureManager,
} from "../feature/FeatureManager";
import { reportersAgainst } from "../feature/reportersAgainst";
import {
    fingerprintsChildrenQuery,
    repoTree,
} from "../feature/repoTree";
import {
    analyzeCohort, CohortAnalysis,
    killChildren,
    leavesUnder,
    splitBy,
    SunburstTree,
    trimOuterRim,
    visit,
} from "../tree/sunburst";
import {
    authHandlers,
    configureAuth,
    corsHandler,
} from "./auth";
import { whereFor } from "./orgPage";
import {
    featureReport,
    skewReport,
    WellKnownReporters,
} from "./wellKnownReporters";

/**
 * Public API routes, returning JSON
 */
export function api(clientFactory: ClientFactory,
                    store: ProjectAnalysisResultStore,
                    featureManager: FeatureManager): ExpressCustomizer {
    return (express: Express, ...handlers: RequestHandler[]) => {

        express.use(bodyParser.json());       // to support JSON-encoded bodies
        express.use(bodyParser.urlencoded({     // to support URL-encoded bodies
            extended: true,
        }));

        configureAuth(express);

        express.options("/api/v1/:workspace_id/fingerprints", corsHandler());
        express.post("/api/v1/:workspace_id/ideal/:id", [corsHandler(), ...authHandlers()], async (req, res) => {
            await featureManager.idealStore.setIdeal(req.params.workspace_id, req.params.id);
            logger.info(`Set ideal to ${req.params.id}`);
            res.sendStatus(200);
        });

        // Return all fingerprints
        express.options("/api/v1/:workspace_id/fingerprints", corsHandler());
        express.get("/api/v1/:workspace_id/fingerprints", [corsHandler(), ...authHandlers()], async (req, res) => {
            try {
                const workspaceId = req.params.workspace_id || "local";
                const fps = await fingerprintsInWorkspace(clientFactory, workspaceId);
                logger.debug("Returning fingerprints for '%s': %j", workspaceId, fps);
                res.json(fps);
            } catch (e) {
                logger.warn("Error occurred getting fingerprints: %s", e.message);
                res.sendStatus(500);
            }
        });

        express.options("/api/v1/:workspace_id/fingerprint/:type", corsHandler());
        express.get("/api/v1/:workspace_id/fingerprint/:type", [corsHandler(), ...authHandlers()], async (req, res) => {
            try {
                const workspaceId = req.params.workspace_id || "local";
                const fps = await fingerprintDataForType(clientFactory, req.params.type, workspaceId);
                logger.debug("Returning fingerprints of type for '%s': %j", workspaceId, fps);
                res.json(fps);
            } catch (e) {
                logger.warn("Error occurred getting fingerprints: %s", e.message);
                res.sendStatus(500);
            }
        });

        /* the d3 sunburst on the /query page uses this */
        express.options("/api/v1/:workspace_id/fingerprint/:type/:name", corsHandler());
        express.get("/api/v1/:workspace_id/fingerprint/:type/:name", [corsHandler(), ...authHandlers()], async (req, res) => {
            try {
                const tree = await repoTree({
                    clientFactory,
                    query: fingerprintsChildrenQuery(whereFor(req), req.query.otherLabel),
                    rootName: req.params.name,
                    featureName: req.params.type,
                });
                logger.debug("Returning fingerprint '%s': %j", req.params.name, tree);
                resolveFeatureNames(featureManager, tree);
                if (req.query.byOrg === "true") {
                    splitBy<{ owner: string }>(tree, l => l.owner, 0);
                } else if (req.query.byThing) {
                    splitBy<{ owner: string }>(tree, l => l.owner, 1);
                }

                res.json(tree);
            } catch (e) {
                logger.warn("Error occurred getting one fingerprint: %s %s", e.message, e.stackTrace);
                res.sendStatus(500);
            }
        });

        // In memory queries against returns
        express.get("/api/v1/:workspace/filter/:name", ...handlers, async (req, res) => {
            const repos = await store.loadWhere(whereFor(req));

            if (req.params.name === "skew") {
                const fingerprints: FP[] = [];
                for await (const fp of fingerprintsFrom(repos.map(ar => ar.analysis))) {
                    if (!fingerprints.some(f => f.sha === fp.sha)) {
                        fingerprints.push(fp);
                    }
                }
                logger.info("Found %d fingerprints", fingerprints.length);
                const skewTree = await skewReport(featureManager).toSunburstTree(() => fingerprints);
                killChildren(skewTree, (c, depth) => {
                    const leaves = leavesUnder(c);
                    logger.info("Found %d leaves under %s", leaves.length, c.name);
                    return leaves.length < 6;
                });
                trimOuterRim(skewTree);
                return res.json(skewTree);
            }

            if (req.params.name === "featureReport") {
                const type = req.query.type;
                const fingerprints: FP[] = [];
                for await (const fp of fingerprintsFrom(repos.map(ar => ar.analysis))) {
                    if (fp.type === type && !fingerprints.some(f => f.sha === fp.sha)) {
                        fingerprints.push(fp);
                    }
                }
                logger.info("Found %d fingerprints", fingerprints.length);
                const featureTree = await featureReport(type, featureManager).toSunburstTree(() => fingerprints);
                return res.json(featureTree);
            }

            const featureQueries = await reportersAgainst(featureManager, repos.map(r => r.analysis));
            const allQueries = _.merge(featureQueries, WellKnownReporters);

            const cannedQuery = allQueries[req.params.name]({
                ...req.query,
            });
            const relevantRepos = repos.filter(ar => req.query.owner ? ar.analysis.id.owner === req.params.owner : true);
            const data = await cannedQuery.toSunburstTree(() => relevantRepos.map(r => r.analysis));
            return res.json(data);
        });

        // Calculate and persist entropy for this fingerprint
        express.put("/api/v1/:workspace/entropy/:type/:name", ...handlers, async (req, res) => {
            await calculateAndPersistEntropy(clientFactory, req.params.type, req.params.name, req.params.workspace);
            res.sendStatus(201);
        });
    };
}

// Use Features to find names of features
function resolveFeatureNames(fm: FeatureManager, t: SunburstTree): void {
    visit(t, l => {
        if ((l as any).sha) {
            const fp = l as any as FP;
            // It's a fingerprint name
            const feature = fm.featureFor(fp.type);
            if (feature) {
                fp.name = feature.toDisplayableFingerprint ? feature.toDisplayableFingerprint(fp) : fp.data;
            }
        }
        return true;
    });
}

/**
 * Data about the use of a fingerprint in a workspace
 */
export interface FingerprintData extends CohortAnalysis {
    name: string;
    type: string;
    categories: string[];
}

/**
 * Raw fingerprints in the workspace
 * @return {Promise<FP[]>}
 */
async function fingerprintsInWorkspace(clientFactory: ClientFactory,
                                       workspaceId: string,
                                       type?: string,
                                       name?: string): Promise<FP[]> {
    return doWithClient<FingerprintData[]>(clientFactory, async client => {
        const sql = `SELECT distinct f.name as fingerprintName, feature_name as type
  from repo_fingerprints rf, repo_snapshots rs, fingerprints f
  WHERE rf.repo_snapshot_id = rs.id AND rf.fingerprint_id = f.id AND rs.workspace_id ${workspaceId === "*" ? "!=" : "="} $1
  AND ${type ? "type = $2" : "true"} AND ${type ? "name = $3" : "true"}`;
        const params = [workspaceId];
        if (!!type) {
            params.push(type);
        }
        if (!!name) {
            params.push(name);
        }

        const rows = await client.query(sql, params);
        return rows.rows.map(row => {
            return {
                name: row.fingerprintname,
                type: row.featurename,
            };
        });
    });
}

async function fingerprintDataForType(clientFactory: ClientFactory, type: string, workspaceId: string): Promise<FingerprintData[]> {
    return doWithClient(clientFactory, async client => {
        const sql = `SELECT distinct f.name as fingerprintName, count(rs.id) as appearsIn
  from repo_fingerprints rf, repo_snapshots rs, fingerprints f
  WHERE rf.repo_snapshot_id = rs.id AND rf.fingerprint_id = f.id AND rs.workspace_id ${workspaceId === "*" ? "!=" : "="} $2
  AND f.feature_name = $1
  GROUP by fingerprintName`;
        const rows = await client.query(sql, [type, workspaceId]);
        return rows.rows.map(row => {
            return {
                name: row.fingerprintname,
                type,
                categories: getCategories({ name: row.featurename }),
                count: parseInt(row.appearsin, 10),
            };
        });
    });
}

async function calculateAndPersistEntropy(clientFactory: ClientFactory, type: string, name: string, workspaceId: string): Promise<void> {
    const fingerprints = await fingerprintsInWorkspace(clientFactory, workspaceId, type, name);
    const cohortAnalysis = await analyzeCohort(async () => fingerprints);
    await doWithClient(clientFactory, async client => {
        const sql = `INSERT INTO fingerprint_analytics (feature_name, name, workspace_id, entropy, variants, count)
        values ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ON CONSTRAINT fingerprint_analytics_pkey DO UPDATE SET entropy = $4, variants = $5, count = $6`;
        const rows = await client.query(sql, [type, name, workspaceId, cohortAnalysis.entropy,
            cohortAnalysis.variants, cohortAnalysis.count]);
        return rows.rows;
    });
}
