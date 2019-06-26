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

import {
    Configuration,
    logger,
} from "@atomist/automation-client";
import {
    PushImpactListener,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import {
    analyzerBuilder,
    ProjectAnalyzer,
} from "@atomist/sdm-pack-analysis";
import { nodeScanner } from "@atomist/sdm-pack-analysis-node";
import { circleScanner } from "@atomist/uhura/lib/element/circle/circleScanner";
import { DockerScanner } from "@atomist/uhura/lib/element/docker/dockerScanner";
import { gitlabCiScanner } from "@atomist/uhura/lib/element/gitlab-ci/gitlabCiScanner";
import { jenkinsScanner } from "@atomist/uhura/lib/element/jenkins/jenkinsScanner";
import { reactScanner } from "@atomist/uhura/lib/element/react/reactScanner";
import { travisScanner } from "@atomist/uhura/lib/element/travis/travisScanner";
import * as _ from "lodash";
import { Client } from "pg";
import { ClientFactory } from "../analysis/offline/persist/pgUtils";
import { PostgresProjectAnalysisResultStore } from "../analysis/offline/persist/PostgresProjectAnalysisResultStore";
import { ProjectAnalysisResultStore } from "../analysis/offline/persist/ProjectAnalysisResultStore";
import { featureManager } from "../customize/featureManager";
import {
    features,
} from "../customize/features";
import { codeMetricsScanner } from "../element/codeMetricsElement";
import { CodeOfConductScanner } from "../element/codeOfConduct";
import { CodeOwnerScanner } from "../element/codeOwnership";
import { packageLockScanner } from "../element/packageLock";
import { idealConvergenceScorer } from "../scorer/idealConvergenceScorer";

/**
 * Add scanners to the analyzer to extract data
 * @param {SoftwareDeliveryMachine} sdm
 * @return {ProjectAnalyzer}
 */
export function createAnalyzer(sdm: SoftwareDeliveryMachine): ProjectAnalyzer {
    return analyzerBuilder(sdm)
        .withScanner(packageLockScanner)
        // .withStack(nodeStackSupport(sdm))
        .withScanner(nodeScanner)
        .withFeatures(features)
        // .withScanner(GitActivityScanner)
        .withScanner(new DockerScanner())
        .withScanner(travisScanner)
        .withScanner(circleScanner)
        .withScanner(jenkinsScanner)
        .withScanner(gitlabCiScanner)
        .withScanner(reactScanner)

        // This one is crazy expensive so skip it
         .withScanner({ action: codeMetricsScanner, runWhen: opts => opts.full })

        .withScanner(CodeOfConductScanner)
        .withScanner(CodeOwnerScanner)
        .withScorer(idealConvergenceScorer(featureManager))
        .build();
}

export function sdmConfigClientFactory(config: Configuration): ClientFactory {
    return () => new Client({
        database: "org_viz",
        ...(_.get(config, "sdm.postgres") || {}),
    });
}

export function analysisResultStore(factory: ClientFactory): ProjectAnalysisResultStore {
    return new PostgresProjectAnalysisResultStore(factory);
}

export function updatedStoredAnalysisIfNecessary(opts: {
    analyzedRepoStore: ProjectAnalysisResultStore,
    analyzer: ProjectAnalyzer,
    maxAgeHours: number,
}): PushImpactListener<any> {
    const maxAgeMillis = 60 * 60 * 1000;
    return async pu => {
        try {
            const found = await opts.analyzedRepoStore.loadByRepoRef(pu.id);
            const now = new Date();
            if (!found || !found.timestamp || now.getTime() - found.timestamp.getTime() > maxAgeMillis) {
                const analysis = await opts.analyzer.analyze(pu.project, pu, { full: true });
                logger.info("Performing fresh analysis of project at %s", pu.id.url);
                await opts.analyzedRepoStore.persist({
                    analysis,
                    timestamp: now,
                    subproject: found.subproject,
                    workspaceId: pu.context.workspaceId,
                });
            } else {
                logger.info("Stored analysis of project at %s is up to date", pu.id.url);
            }
        } catch (err) {
            // Never fail
            logger.warn(err);
        }
    };
}
