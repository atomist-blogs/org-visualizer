import { Aspect } from "@atomist/sdm-pack-fingerprint";
import * as React from "react";
import { FingerprintUsage } from "../lib/analysis/offline/persist/ProjectAnalysisResultStore";
import { CohortAnalysis } from "../lib/analysis/offline/spider/analytics";
import { CustomReporters } from "../lib/customize/customReporters";
import { RepoForDisplay } from "./repoList";
import { collapsible } from "./utils";

export interface FingerprintForDisplay extends
    Pick<FingerprintUsage, "type" | "name">,
    Pick<CohortAnalysis, "count" | "variants"> {
    displayName: string;
    entropy?: number;
}

type AspectForDisplay = Partial<Pick<Aspect, "documentationUrl" | "name" | "displayName">>;

export interface AspectFingerprintsForDisplay {
    aspect: AspectForDisplay;
    fingerprints: FingerprintForDisplay[];
}

interface UnfoundAspectForDisplay {
    documentationUrl?: string;
    displayName: string;
}

/**
 * Props for entry page
 */
export interface OverviewProps {
    projectsAnalyzed: number;
    foundAspects: AspectFingerprintsForDisplay[];
    unfoundAspects: UnfoundAspectForDisplay[];
    repos: RepoForDisplay[];
    virtualProjectCount: number;
}

function displayAspect(f: AspectFingerprintsForDisplay, i: number): React.ReactElement {
    const key = "collapsible" + i;
    const expandByDefault = f.fingerprints.length === 1;

    const allLink: (trim: boolean) => string = trim => `./fingerprint/${f.aspect.name}/*?byOrg=true&trim=${trim}`;
    const about = !f.aspect.documentationUrl ? "" :
        <a href={f.aspect.documentationUrl}>About</a>;

    const graphAll = f.fingerprints.length <= 1 ? "" : <a href={allLink(true)}>All fingerprints</a>;
    const graphAllExpanded = f.fingerprints.length <= 1 ? "" : <a href={allLink(false)}>Expanded</a>;

    const summaryListItem = about || graphAll || graphAllExpanded ?
        <li key={"all" + i}>{about} {graphAll} {graphAllExpanded}</li> : "";

    return <div className="wrap-collapsible feature-collapsible">
        <input id={key} className="sneaky toggle" type="checkbox" defaultChecked={expandByDefault}></input>
        <label htmlFor={key} className="lbl-toggle fp-list">{f.aspect.displayName} ({f.fingerprints.length})</label>
        <div className="collapsible-content">
            <div className="content-inner">
                <ul>
                    {summaryListItem}
                    {f.fingerprints.map(fingerprintListItem)}
                </ul>
            </div>
        </div>
    </div>;
}

function displayUnfoundAspects(unfoundAspects: UnfoundAspectForDisplay[]): React.ReactElement {
    if (unfoundAspects.length === 0) {
        return <div></div>;
    }
    return <div>
        <h2>Unseen Aspects ({unfoundAspects.length})</h2>
        These aspects are understood by this <i>org-visualizer</i> instance but were not found in any project:
        <ul>
            {unfoundAspects.map(displayUnfoundAspect)}
        </ul>
    </div>;
}

function displayUnfoundAspect(unfoundAspectForDisplay: UnfoundAspectForDisplay, i: number): React.ReactElement {
    const link = !!unfoundAspectForDisplay.documentationUrl ?
        <a href={unfoundAspectForDisplay.documentationUrl}>{unfoundAspectForDisplay.displayName}</a> : unfoundAspectForDisplay.displayName;
    return <li className="unfound">
        {link}
    </li>;
}

function fingerprintListItem(f: FingerprintForDisplay): React.ReactElement {
    const displayName = f.displayName || f.name;
    const variantsQueryLink: string = `./fingerprint/${encodeURIComponent(f.type)}/${encodeURIComponent(f.name)}?byOrg=true`;
    const existsLink: string = `./fingerprint/${f.type}/${f.name}?byOrg=true&otherLabel=None`;
    const ent = f.entropy ? <span>{`entropy=${f.entropy.toFixed(2)}`}</span> : "";

    return <li key={displayName}>
        <i>{displayName}</i>: {f.count} projects, {" "}
        <a href={variantsQueryLink}>{f.variants} variants</a>{" "}{ent}{" "}
        <a href={existsLink}>Presence</a> {" "}
    </li>;
}

export function displayAspects(props: OverviewProps): React.ReactElement {
    return <div>
        <h2>Aspects ({props.foundAspects.length})</h2>
        <div className="importantAspects">
            <ul>
                {props.foundAspects.map(displayAspect)}
            </ul>
        </div>
        {displayUnfoundAspects(props.unfoundAspects)}
    </div>;
}

function displayDashboards(props: OverviewProps): React.ReactElement {
    return <div>
        <h2>Dashboards</h2>
        <ul>
            {collapsible("explore", "Explore",
                <ul>
                    <li>Drift Report</li>
                    <ul>
                        <li key="code-1"><a href="./drift?percentile=98">Aspects with the
                            greatest entropy</a></li>
                        <li key="code-1"><a href="./drift">Entropy for all aspects</a></li>
                    </ul>
                    <li><a href="./explore">Interactive explorer</a> - Explore your {props.repos.length} repositories by tag</li>
                </ul>,
                true)}
            {collapsible("repo-nav", "Repository List",
                <ul>
                    <li key="repo-nav-by-org"><a href="./repositories?byOrg=true">By organization</a></li>
                    <li key="repo-nav-not-by-org"><a href="./repositories?byOrg=false">Ranked</a></li>
                </ul>,
                true)}
            {collapsible("custom-reports", "Custom Reports",
                displayCustomReports(),
                true)}
        </ul>
    </div>;
}

function displayCustomReports(): React.ReactElement {
    return <ul>
        {Object.getOwnPropertyNames(CustomReporters).map(name => {
            const reporter = CustomReporters[name];
            return <li key={`report-${name}`}><a
                href={`./report/${name}?byOrg=true`}>{reporter.summary}</a> - {reporter.description}</li>;
        })}
    </ul>;
}

// tslint:disable:max-line-length

export function Overview(props: OverviewProps): React.ReactElement {
    if (props.projectsAnalyzed === 0) {
        return <div>
            <h2>No projects analyzed</h2>
            Use the `atomist analyze ...` command to analyze some projects.
            See <a
                href="https://github.com/atomist-blogs/org-visualizer/blob/master/README.md#analyze-your-repositories">the
            README</a> for details.
            {displayDeveloperResources()}
        </div>;
    }

    return <div>
        {displayDashboards(props)}
        {displayAspects(props)}
        {displayDeveloperResources()}
    </div>;
}

function displayDeveloperResources(): React.ReactElement {
    return <div>
        <h2>Developer</h2>
        <ul>
            <li><a href="https://github.com/atomist-blogs/org-visualizer/blob/master/docs/developer.md">Developer
                Guide</a> - Developer documentation on <a href="https://github.com/atomist-blogs">GitHub</a></li>
            <li><a href="./api-docs">Swagger documentation</a> - Interactive documentation for API endpoints running on
                this server
            </li>
            <li><a href="./api/v1/*/fingerprint/npm-project-deps/tslint?byOrg=true">Example of backing JSON data</a> -
                Example tree structured data return
            </li>
        </ul>
    </div>;
}
