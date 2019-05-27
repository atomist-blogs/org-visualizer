import * as React from "react";
import { fingerprintImpactHandler } from "@atomist/sdm-pack-fingerprints";

export interface FeatureForDisplay {
    displayName: string;
}

export interface ProjectExplorerProps {
    owner: string;
    repo: string;
    features: FeatureForDisplay[];
}

export function ProjectExplorer(props: ProjectExplorerProps): React.ReactElement {
    return <div>
        <h1>Project {props.owner}:{props.repo}</h1>

        This is a good project

        <h2>Features</h2>

        {props.features.map(displayFeature)};
    </div>;
}

function displayFeature(feature: FeatureForDisplay): React.ReactElement {
    return <h3>{feature.displayName}</h3>;
};
