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

import { ProjectAnalysis } from "@atomist/sdm-pack-analysis";
import { DeliveryPhases } from "@atomist/sdm-pack-analysis/lib/analysis/phases";
import { BaseFeature, FP, NpmDeps } from "@atomist/sdm-pack-fingerprints";
import { CodeStats, consolidate, Language } from "@atomist/sdm-pack-sloc/lib/slocReport";
import * as _ from "lodash";
import * as path from "path";
import { CodeMetricsElement } from "../element/codeMetricsElement";
import { PackageLock } from "../element/packageLock";
import { fingerprintsFrom } from "../feature/DefaultFeatureManager";
import { Analyzed } from "../feature/FeatureManager";
import { Reporters } from "../feature/reporters";
import { mavenDependenciesFeature } from "../feature/spring/mavenDependenciesFeature";
import {
    AnalyzedGrouper,
    DefaultAnalyzedRenderer,
    OrgGrouper,
    ProjectAnalysisGrouper,
} from "../feature/support/groupingUtils";
import { ReportBuilder, treeBuilder, TreeBuilder } from "../tree/TreeBuilder";

/**
 * Well known reporters against our repo cohort.
 * Works against full analyses.
 */
export const WellKnownReporters: Reporters<ProjectAnalysis> = {

        fileCount: params =>
            treeBuilderFor<Analyzed>("fileCount", params)
                .renderWith(ar => {
                    const sizeFp = ar.fingerprints.find(fp => fp.name === "size");
                    const size = sizeFp ? parseInt(sizeFp.data, 10) : 1;
                    const projectName = ar.id.path ?
                        ar.id.repo + path.sep + ar.id.path :
                        ar.id.repo;
                    const url = ar.id.path ?
                        ar.id.url + "/tree/" + (ar.id.sha || "master") + "/" + ar.id.path :
                        ar.id.url;

                    return {
                        name: projectName,
                        size,
                        url,
                        repoUrl: ar.id.url,
                    };
                }),

        // TODO this could be more generic for sized things
        branchCount: params =>
            treeBuilderFor<Analyzed>("branchCount", params)
                .renderWith(ar => {
                    const sizeFp = ar.fingerprints.find(fp => fp.name === "branches");
                    const size = sizeFp ? parseInt(sizeFp.data, 10) : 1;
                    const projectName = ar.id.path ?
                        ar.id.repo + path.sep + ar.id.path :
                        ar.id.repo;
                    const url = ar.id.path ?
                        ar.id.url + "/tree/" + (ar.id.sha || "master") + "/" + ar.id.path :
                        ar.id.url;

                    return {
                        name: projectName,
                        size,
                        url,
                        repoUrl: ar.id.url,
                    };
                }),

        licenses: params =>
            treeBuilderFor<ProjectAnalysis>("licenses", params)
                .group({
                    name: "license",
                    by: ar => {
                        if (!ar.elements.node) {
                            return "not npm";
                        }
                        return _.get(ar, "elements.node.packageJson.license", "No license");
                    },
                })
                .renderWith(DefaultAnalyzedRenderer),

        skew:
            params => {
                return {
                    toSunburstTree: async originalQuery => {
                        const fingerprints: FP[] = [];
                        for await (const fp of fingerprintsFrom(originalQuery())) {
                            if (!fingerprints.some(f => f.sha === fp.sha)) {
                                fingerprints.push(fp);
                            }
                        }
                        const grouped = _.groupBy(fingerprints, fp => fp.type);

                        return {
                            name: "skew",
                            children: Object.getOwnPropertyNames(grouped).map(name => {
                                return {
                                    name,
                                    children: grouped[name].map(g => {
                                        return {
                                            name: g.name,
                                            size: 1,
                                        };
                                    }),
                                };
                            }),
                        };
                    },
                };
            },

        typeScriptVersions:
            params =>
                treeBuilderFor("TypeScript versions", params)
                    .group({
                        name: "version",
                        by: ar => _.get(ar, "elements.node.typeScript.version", params.otherLabel),
                    })
                    .renderWith(DefaultAnalyzedRenderer),

        springVersions: params =>
            treeBuilderFor("Spring Boot version", params)
                .group({
                    name: "version",
                    by: ar => _.get(ar, "elements.node.springboot.version", params.otherLabel),
                })
                .renderWith(DefaultAnalyzedRenderer),

        langs:
            params =>
                treeBuilderFor<ProjectAnalysis>("languages", params)
                    .customGroup<CodeStats>({
                        name: "language", to: async ars => {
                            const cms: CodeStats[] = [];
                            for await (const ar of ars) {
                                const cm = ar.elements.codemetrics as CodeMetricsElement;
                                if (cm) {
                                    cms.push(...cm.languages);
                                }
                            }

                            const distinctLanguages: Language[] = _.uniqBy(_.flatten(cms.map(cm => cm.language)), l => l.name);
                            const s: Record<string, CodeStats[]> = {};
                            distinctLanguages.forEach(lang => s[lang.name] = [consolidate(lang, cms)]);
                            return s;
                        },
                    })
                    .map<ProjectAnalysis & { lang: string }>({
                        async* mapping(cs: AsyncIterable<CodeStats>, originalQuery: () => AsyncIterable<ProjectAnalysis>) {
                            // TODO don't materialize this
                            const source: ProjectAnalysis[] = [];
                            for await (const pa of originalQuery()) {
                                source.push(pa);
                            }
                            for await (const s of cs) {
                                for (const r of source.filter(ar => {
                                    const cm = ar.elements.codemetrics as CodeMetricsElement;
                                    return cm.languages.some(l => l.language.name === s.language.name);
                                })
                                    .map(ar => ({ ...ar, lang: s.language.name }))) {
                                    yield r;
                                }
                            }
                        },
                    })
                    .renderWith(ar => ({
                        name: ar.id.repo,
                        size: (ar.elements.codemetrics as CodeMetricsElement).languages.find(l => l.language.name === ar.lang).total,
                        url: `/projects/${ar.id.owner}/${ar.id.repo}`,
                        repoUrl: ar.id.url,
                    })),

        // Version of a particular library
        libraryVersions:
            params =>
                treeBuilderFor<ProjectAnalysis>(`Versions of ${params.artifact}`, params)
                    .group({
                        name: "version",
                        by: ar => {
                            const dep = _.get(ar, "analysis.dependencies", []).find(d => d.artifact === params.artifact);
                            return !!dep ? dep.version : params.otherLabel;
                        },
                    })
                    .group({
                        name: "resolved",
                        by: ar => {
                            const pl = ar.elements.packageLock as PackageLock;
                            if (!pl) {
                                return params.artifact;
                            }
                            return pl.packageLock.dependencies[params.artifact].version;
                        },
                    })
                    .renderWith(DefaultAnalyzedRenderer),

        npmDependencyCount:
            params => featureGroup("Maven dependency count", params, NpmDeps),

        mavenDependencyCount:
            params => featureGroup("Maven dependency count", params, mavenDependenciesFeature),
        loc:
            params =>
                treeBuilderFor<ProjectAnalysis>("loc", params)
                    .group({ name: "size", by: groupByLoc })
                    .split<CodeStats>({
                        splitter: ar => {
                            const cm = ar.elements.codemetrics as CodeMetricsElement;
                            return cm.languages;
                        },
                        namer: a => a.id.repo,
                    })
                    .renderWith(cs => {
                        return {
                            name: `${cs.language.name} (${cs.source})`,
                            // url: ar.analysis.id.url,
                            size: cs.source,
                        };
                    }),

        uhura:
            params =>
                treeBuilderFor<ProjectAnalysis>("Uhura readiness", params)
                    .group({
                        // Group by count of Uhura
                        name: "level", by: a => {
                            const ps = _.get(a, "analysis.phaseStatus") as Record<keyof DeliveryPhases, boolean>;
                            if (!ps) {
                                return undefined;
                            }
                            let count = 0;
                            Object.getOwnPropertyNames(ps).forEach(key => {
                                if (ps[key]) {
                                    count++;
                                }
                            });
                            return "" + count;
                        },
                    })
                    .group({
                        name: "phaseStatus",
                        by: a => {
                            const ps = a.phaseStatus;
                            if (!ps) {
                                return undefined;
                            }
                            return Object.getOwnPropertyNames(ps)
                                .filter(k => ps[k])
                                .map(k => k.replace("Goals", ""))
                                .join(",");
                        },
                    })
                    .renderWith(DefaultAnalyzedRenderer),

        // Generic path
        path: params =>
            treeBuilderFor(`Path ${params.path}`, params)
                .group({
                    name: params.path,
                    by: ar => {
                        const raw = _.get(ar, params.path, params.otherLabel);
                        if (!raw) {
                            return raw;
                        }
                        return typeof raw === "string" ? raw : JSON.stringify(raw);
                    },
                })
                .renderWith(DefaultAnalyzedRenderer),
    }
;

const byDocker: ProjectAnalysisGrouper = ar => {
    return !!ar.elements.docker ? "Yes" : "No";
};

const groupByLoc: ProjectAnalysisGrouper = ar => {
    const cm = ar.elements.codemetrics as CodeMetricsElement;
    if (!cm) {
        return undefined;
    }
    if (cm.lines > 20000) {
        return "venti";
    }
    if (cm.lines > 8000) {
        return "grande";
    }
    if (cm.lines > 2000) {
        return "tall";
    }
    return "small";
};

function featureGroup(name: string, params: any, feature: BaseFeature) {
    return treeBuilderFor<ProjectAnalysis>(name, params)
        .group({ name: "size", by: groupByFingerprintCount(feature) })
        .renderWith(ar => {
            const size = ar.fingerprints.filter(feature.selector).length;
            return {
                name: `${ar.id.repo} (${size})`,
                url: ar.id.url,
                size,
            };
        });
}

/**
 * Group by the number of fingerprints from this feature
 * @param {BaseFeature} feature
 * @return {AnalyzedGrouper}
 */
function groupByFingerprintCount(feature: BaseFeature): AnalyzedGrouper {
    return ar => {
        const cm = ar.fingerprints.filter(feature.selector).length;
        if (!cm) {
            return undefined;
        }
        if (cm > 100) {
            return "venti";
        }
        if (cm > 50) {
            return "grande";
        }
        if (cm > 15) {
            return "tall";
        }
        return "small";
    };
}

export function treeBuilderFor<A extends Analyzed = Analyzed>(name: string, params: any): TreeBuilder<A, A> {
    const tb = treeBuilder<A>(name);
    return (params.byOrg === "true") ?
        tb.group({ name: "org", by: OrgGrouper }) :
        tb;
}

export function skewReport(): ReportBuilder<FP> {
    return treeBuilder<FP>("skew")
        .group({
            name: "type",
            by: fp => fp.type,
        })
        .group({
            name: "name",
            by: fp => fp.name,
        })
        .renderWith(fp => {
            return {
                name: fp.sha,
                size: 1,
            };
        });
}
