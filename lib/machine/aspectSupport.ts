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
    BannerSection,
    Configuration,
    HttpClientFactory,
} from "@atomist/automation-client";
import { ExpressCustomizer } from "@atomist/automation-client/lib/configuration";
import {
    ExtensionPack,
    ExtensionPackMetadata,
    metadata,
    PushImpact,
} from "@atomist/sdm";
import {
    AllGoals,
    isInLocalMode,
} from "@atomist/sdm-core";
import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import {
    Aspect,
    cachingVirtualProjectFinder,
    fileNamesVirtualProjectFinder,
    fingerprintSupport,
    PublishFingerprints,
    RebaseOptions,
    VirtualProjectFinder,
} from "@atomist/sdm-pack-fingerprints";
import { sdmConfigClientFactory } from "../analysis/offline/persist/pgClientFactory";
import { ClientFactory } from "../analysis/offline/persist/pgUtils";
import {
    analyzeGitHubByQueryCommandRegistration,
    analyzeGitHubOrganizationCommandRegistration,
    analyzeLocalCommandRegistration,
} from "../analysis/offline/spider/analyzeCommand";
import {
    AnalysisTracker,
    AnalysisTracking,
} from "../analysis/tracking/analysisTracker";
import {
    RepositoryScorer, Tagger,
    TaggerDefinition,
} from "../aspect/AspectRegistry";
import { DefaultAspectRegistry } from "../aspect/DefaultAspectRegistry";
import { isDeliveryAspect } from "../aspect/delivery/DeliveryAspect";
import { UndesirableUsageChecker } from "../aspect/ProblemStore";
import {
    AspectCompatibleScorer,
    emitScoringAspect,
    ScoredAspect,
} from "../aspect/score/ScoredAspect";
import { api } from "../routes/api";
import { addWebAppRoutes } from "../routes/web-app/webAppRoutes";
import { ScoreWeightings } from "../scorer/Score";
import {
    analysisResultStore,
    createAnalyzer,
} from "./machine";

import * as _ from "lodash";
import { isClassificationAspect, taggerAspect } from "../aspect/compose/classificationAspect";
import { tagsFromClassificationFingerprints } from "../tagger/commonTaggers";
import { exposeFingerprintScore } from "../scorer/commonScorers";

/**
 * Default VirtualProjectFinder, which recognizes Maven, npm,
 * and Gradle projects and Python projects using requirements.txt.
 */
export const DefaultVirtualProjectFinder: VirtualProjectFinder =
    // Consider directories containing any of these files to be virtual projects
    cachingVirtualProjectFinder(
        fileNamesVirtualProjectFinder(
            "package.json",
            "pom.xml",
            "build.gradle",
            "requirements.txt",
        ));

export const DefaultScoreWeightings: ScoreWeightings = {
    // Weight this to penalize projects with few other scorers
    anchor: 3,
};

/**
 * Options to configure the aspect extension pack
 */
export interface AspectSupportOptions {

    /**
     * Aspects that cause this SDM to calculate fingerprints from projects
     * and delivery events.
     */
    aspects: Aspect | Aspect[];

    /**
     * If set, this enables multi-project support by helping aspects work
     * on virtual projects. For example, a VirtualProjectFinder may establish
     * that subdirectories with package.json or requirements.txt files are
     * subprojects, enabling aspects to work on their internal structure
     * without needing to drill into the entire repository themselves.
     */
    virtualProjectFinder?: VirtualProjectFinder;

    /**
     * Registrations that can tag projects based on fingerprints.
     * Executed as fingerprints
     */
    taggers?: Tagger | Tagger[];

    /**
     * Registrations that can tag projects based on fingerprints.
     * Allows rapid in-memory use.
     */
    inMemoryTaggers?: TaggerDefinition | TaggerDefinition[];

    /**
     * Scoring fingerprints. Name to scorers
     */
    scorers?: Record<string, AspectCompatibleScorer | AspectCompatibleScorer[]>;

    /**
     * Scorers that are computed in memory. Allows for faster iteration on scoring logic.
     * May ultimately be promoted to scorers.
     */
    inMemoryScorers?: RepositoryScorer | RepositoryScorer[];

    /**
     * Optional weightings for different scorers. The key is scorer name.
     */
    weightings?: ScoreWeightings;

    /**
     * Set this to flag undesirable fingerprints: For example,
     * a dependency you wish to eliminate from all projects, or
     * an internally inconsistent fingerprint state.
     */
    undesirableUsageChecker?: UndesirableUsageChecker;

    exposeWeb?: boolean;

    /**
     * Custom fingerprint routing. Used in local mode.
     * Default behavior is to send fingerprints to Atomist.
     */
    publishFingerprints?: PublishFingerprints;

    /**
     * Delivery goals to attach fingerprint behavior to, if provided.
     * Delivery goals must have well-known names
     */
    goals?: Partial<Pick<AllGoals, "build" | "pushImpact">>;

    rebase?: RebaseOptions;

    /**
     * If this is provided, it can distinguish the UI instance.
     * Helps distinguish different SDMs during development.
     */
    instanceMetadata?: ExtensionPackMetadata;
}

/**
 * Return an extension pack to add aspect support with the given aspects to an SDM.
 * If we're in local mode, expose analyzer commands and HTTP endpoints.
 */
export function aspectSupport(options: AspectSupportOptions): ExtensionPack {
    const scoringAspects: ScoredAspect[] = _.flatten(
        Object.getOwnPropertyNames(options.scorers)
            .map(name => emitScoringAspect(name, toArray(options.scorers[name] || []), options.weightings)))
        .filter(a => !!a);
    const tagAspect = taggerAspect({
        name: "tagger",
        displayName: "tagger",
    }, ...toArray(options.taggers) || []);
    const aspects = [...toArray(options.aspects || []), ...scoringAspects, tagAspect];

    return {
        ...metadata(),
        configure: sdm => {
            const cfg = sdm.configuration;
            const analysisTracking = new AnalysisTracker();

            if (isInLocalMode()) {
                // If we're in local mode, expose analyzer commands and
                // HTTP endpoints
                const analyzer = createAnalyzer(
                    aspects,
                    options.virtualProjectFinder || exports.DefaultVirtualProjectFinder);

                sdm.addCommand(analyzeGitHubByQueryCommandRegistration(analyzer, analysisTracking));
                sdm.addCommand(analyzeGitHubOrganizationCommandRegistration(analyzer, analysisTracking));
                sdm.addCommand(analyzeLocalCommandRegistration(analyzer, analysisTracking));
            }

            // Add support for calculating aspects on push and computing delivery aspects
            // This is only possible in local mode if we have a fingerprint publisher,
            // as we can't send to Atomist (the default)
            if (!!options.goals && (!isInLocalMode() || !!options.publishFingerprints)) {
                if (!!options.goals.pushImpact) {
                    // Add supporting for calculating fingerprints on every push
                    sdm.addExtensionPacks(fingerprintSupport({
                        pushImpactGoal: options.goals.pushImpact as PushImpact,
                        aspects,
                        rebase: options.rebase,
                        publishFingerprints: options.publishFingerprints,
                    }));
                }

                aspects
                    .filter(isDeliveryAspect)
                    .filter(a => a.canRegister(sdm, options.goals))
                    .forEach(da => da.register(sdm, options.goals, options.publishFingerprints));
            }

            const exposeWeb = options.exposeWeb !== undefined ? options.exposeWeb : isInLocalMode();
            if (exposeWeb) {
                const { customizers, routesToSuggestOnStartup } =
                    orgVisualizationEndpoints(sdmConfigClientFactory(cfg), cfg.http.client.factory,
                        analysisTracking, options, aspects);
                cfg.http.customizers.push(...customizers);
                routesToSuggestOnStartup.forEach(rtsos => {
                    cfg.logging.banner.contributors.push(suggestRoute(rtsos));
                });
            }
        },
    };
}

function suggestRoute({ title, route }: { title: string, route: string }):
    (c: Configuration) => BannerSection {
    return cfg => ({
        title,
        body: `http://localhost:${cfg.http.port}${route}`,
    });
}

function orgVisualizationEndpoints(dbClientFactory: ClientFactory,
                                   httpClientFactory: HttpClientFactory,
                                   analysisTracking: AnalysisTracking,
                                   options: AspectSupportOptions,
                                   aspects: Aspect[]): {
    routesToSuggestOnStartup: Array<{ title: string, route: string }>,
    customizers: ExpressCustomizer[],
} {
    const resultStore = analysisResultStore(dbClientFactory);
    const fingerprintClassificationNamesFound = _.flatten(aspects.filter(isClassificationAspect).map(ca => ca.tags));
    const scorerNames = Object.getOwnPropertyNames((options.scorers || {}));
    const aspectRegistry = new DefaultAspectRegistry({
        idealStore: resultStore,
        problemStore: resultStore,
        aspects,
        undesirableUsageChecker: options.undesirableUsageChecker,
        scorers: toArray(options.inMemoryScorers || []).concat(scorerNames.map(exposeFingerprintScore)),
        scoreWeightings: options.weightings || DefaultScoreWeightings,
    })
        .withTaggers(...toArray(options.inMemoryTaggers || []))
        // Add in memory taggers for all classification fingerprints
        .withTaggers(...tagsFromClassificationFingerprints(...fingerprintClassificationNamesFound));

    const aboutTheApi = api(resultStore, aspectRegistry);

    if (!isInLocalMode()) {
        return {
            routesToSuggestOnStartup: aboutTheApi.routesToSuggestOnStartup,
            customizers: [aboutTheApi.customizer],
        };
    }

    const aboutStaticPages = addWebAppRoutes(aspectRegistry, resultStore, analysisTracking, httpClientFactory,
        options.instanceMetadata || metadata());

    return {
        routesToSuggestOnStartup:
            [...aboutStaticPages.routesToSuggestOnStartup,
                ...aboutTheApi.routesToSuggestOnStartup],
        customizers: [aboutStaticPages.customizer, aboutTheApi.customizer],
    };
}
