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

import { Client } from "pg";
import { doWithClient } from "../analysis/offline/persist/PostgresProjectAnalysisResultStore";
import { SunburstTree } from "../tree/sunburst";

export interface TreeQuery {

    clientFactory: () => Client;

    featureName: string;

    rootName: string;

    /**
     * SQL query. Must return form of value, repo info - Must be sorted by repo
     */
    query: string;
}

// Returns children
export function fingerprintsChildrenQuery(whereClause: string) {
    return `
SELECT row_to_json(fingerprint_groups) FROM (SELECT json_agg(fp) children
FROM (
       SELECT
         fingerprints.name as name, fingerprints.sha as sha, fingerprints.data as data, fingerprints.feature_name as type,
         (
           SELECT json_agg(row_to_json(repo))
           FROM (
                  SELECT
                    repo_snapshots.owner, repo_snapshots.name, repo_snapshots.url, 1 as size
                  FROM repo_fingerprints, repo_snapshots
                   WHERE repo_fingerprints.fingerprint_id = fingerprints.id
                    AND repo_snapshots.id = repo_fingerprints.repo_snapshot_id
                    AND ${whereClause}
                ) repo
         ) children
       FROM fingerprints WHERE fingerprints.feature_name = $1 and fingerprints.name = $2
) fp) as fingerprint_groups
`;
}

/**
 * Tree where children is one of a range of values, leaves individual repos with one of those values
 * @param {TreeQuery} opts
 * @return {Promise<SunburstTree>}
 */
export async function repoTree(opts: TreeQuery): Promise<SunburstTree> {
    return doWithClient(opts.clientFactory, async client => {
        console.log(opts.query);
        const results = await client.query(opts.query, [opts.featureName, opts.rootName]);
        // TODO error checking
        const data = results.rows[0];
        return {
            name: opts.rootName,
            children: data.row_to_json.children,
        };
    });
}
