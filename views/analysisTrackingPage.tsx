import * as React from "react";

interface AnalysisTrackingRepo {
    description: string;
    url?: string;
    progress: "Planned" | "Going" | "Stopped";
    keptExisting: boolean;
    millisTaken?: number;
    errorMessage?: string;
    stackTrace?: string;
    snapshotId?: string;
    virtualProjectsReport?: { count: number, finderName: string };
    aspects: AnalysisTrackingAspect[];
}

interface AnalysisTrackingAspect {
    aspectName: string;
    fingerprintsFound: number;
    visible: boolean;
    error?: Error;
}
interface AnalysisTrackingAnalysis {
    description: string;
    analysisKey: string;
    progress: "Going" | "Stopped";
    repos: AnalysisTrackingRepo[];
    error?: Error;
    completedAt?: Date;
}

export interface AnalysisTrackingProps {
    analyses: AnalysisTrackingAnalysis[];
}

function displayRepository(repo: AnalysisTrackingRepo & { repoAnalysisId: string }): React.ReactElement {
    let className = "analysisTrackingRepo " + repo.progress;
    if (repo.keptExisting) {
        className += " keptExistingAnalysis";
    }
    if (repo.errorMessage) {
        className += " failed";
    }
    const timeTaken = repo.millisTaken ? `Took ${repo.millisTaken / 1000}s` : undefined;
    const gitLink = repo.url ? <a href={repo.url}><img src="/git.png" className="linkToSourceImage"></img></a> : undefined;
    const insightsLink = repo.snapshotId ? <a href={"/repository?id=" + repo.snapshotId}>
        <img src="/hexagonal-fruit-of-power.png" className="linkToInsightsImage"></img>
    </a> : undefined;
    const virtualProjectsDescription = !repo.virtualProjectsReport ? "Not checking repo for interior projects" :
        `${repo.virtualProjectsReport.count} interior projects found by ${repo.virtualProjectsReport.finderName}`;
    const aspectSummary = repo.progress === "Planned" || repo.keptExisting ? undefined : summarizeAspects(repo.aspects);
    return <div className={className}>
        <p className="analysisRepoDescription">{repo.description} {gitLink} {insightsLink} </p>
        <section className="timeTakenToAnalyzeRepo">{timeTaken}</section>
        <section className="aboutVirtualProjects">{virtualProjectsDescription}</section>
        {displayFailure(repo)}
        {aspectSummary}
    </div>;
}

function summarizeAspects(aspects: AnalysisTrackingAspect[]): React.ReactElement {
    const fingerprintTotal = aspects.map(a => a.fingerprintsFound).filter(f => !!f).reduce((a, b) => a + b, 0);
    const errors = aspects.filter(a => !!a.error);
    const errorDisplays = errors.length > 0 ? <div>{errors.map(displayAspectError)}</div> : undefined;
    const reportVisibleAspects = `(in ${aspects.filter(a => a.fingerprintsFound > 0 && a.visible).length} visible aspects)`;
    return <div>
        {aspects.length} aspects => {fingerprintTotal} fingerprints {reportVisibleAspects}
        {errorDisplays}
    </div>;
}

function displayAspectError(ae: { error?: Error, aspectName: string }): React.ReactElement {
    return <div className="failedAspect">
        <p>{ae.aspectName} failed with: {ae.error.message}</p>
        <pre>{ae.error.stack}</pre>
    </div>;
}
function displayFailure(repo: { errorMessage?: string, stackTrace?: string }): React.ReactElement {
    if (!repo.errorMessage) {
        return undefined;
    }
    return <div className="analyzeRepoError">
        <p>{repo.errorMessage}</p>
        <pre>{repo.stackTrace}</pre>
    </div>;
}

function listRepositories(title: string, repos: AnalysisTrackingRepo[]): React.ReactElement {
    return <div className="repoList">{title}
        {repos.map((r, i) => displayRepository({ ...r, repoAnalysisId: "" + i }))}
    </div>;
}

function displayAnalysis(analysis: AnalysisTrackingAnalysis): React.ReactElement {
    const analysisStatusClass = analysis.progress === "Going" ? "ongoingAnalysis" : "nongoingAnalysis";
    const dates = analysis.completedAt ? <p className="analysisDates">Completed at: {analysis.completedAt.toString()}</p> : undefined;
    return <div className={analysisStatusClass}>
        {analysis.description}
        {dates}
        {displayAnalysisFailure(analysis)}
        <h4>Repositories:</h4>
        <div className="repositoryColumns">
            {listRepositories("Planned", analysis.repos.filter(r => r.progress === "Planned"))}
            {listRepositories("Going", analysis.repos.filter(r => r.progress === "Going"))}
            {listRepositories("Finished", analysis.repos.filter(r => r.progress === "Stopped"))}
        </div>
    </div>;
}

function displayAnalysisFailure(analysis: AnalysisTrackingAnalysis): React.ReactElement {
    if (!analysis.error) {
        return undefined;
    }
    return <div className="analyzeRepoErrors">
        <p>{analysis.error.message}</p>
        <pre>{analysis.error.stack}</pre>
    </div>;
}

function listAnalyses(analyses: AnalysisTrackingAnalysis[]): React.ReactElement {
    return <div className="analysisList">{analyses.sort(runningFirst).map(displayAnalysis)}</div>;
}

function runningFirst(a1: AnalysisTrackingAnalysis, a2: AnalysisTrackingAnalysis): number {
    if (a1.progress === "Going" && a2.progress === "Stopped") {
        return -1;
    }
    if (a2.progress === "Going" && a1.progress === "Stopped") {
        return 1;
    }
    if (a1.completedAt && a2.completedAt) {
        // more recent on top
        return a2.completedAt.getTime() - a1.completedAt.getTime();
    }
    return 0;
}

export function AnalysisTrackingPage(props: AnalysisTrackingProps): React.ReactElement {
    if (props.analyses.length === 0) {
        return <div>No analyses in progress.
            Start one at the command line:{" "}
            <span className="typeThisAtCommandLine">atomist analyze local repositories</span></div>;
    }
    return <div>
        <h2>Refresh this page to see progress.</h2>
        <a href="/analysis/aspects/">Track aspect performance</a>
        {listAnalyses(props.analyses)}
    </div>;
}
