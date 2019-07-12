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

import { FP, } from "@atomist/sdm-pack-fingerprints";
import * as _ from "lodash";
import {
    FeatureManager,
    HasFingerprints,
    IdealStore,
    ManagedFeature,
    UndesirableUsage,
    UndesirableUsageChecker,
} from "./FeatureManager";

export function allFingerprints(ar: HasFingerprints | HasFingerprints[]): FP[] {
    return _.flatMap(toArray(ar), a => a.fingerprints);
}

function toArray<T>(value: T | T[]): T[] {
    if (!!value) {
        if (Array.isArray(value)) {
            return value;
        } else {
            return [value];
        }
    } else {
        return undefined;
    }
}

export async function* fingerprintsFrom(ar: HasFingerprints[] | AsyncIterable<HasFingerprints>): AsyncIterable<FP> {
    for await (const hf of ar) {
        for (const fp of hf.fingerprints) {
            yield fp;
        }
    }
}

/**
 * Features must have unique names
 */
export class DefaultFeatureManager implements FeatureManager {

    get features() {
        return this.opts.features;
    }

    public featureFor(type: string): ManagedFeature | undefined {
        return type ? this.features.find(f => f.name === type) : undefined;
    }

    public get undesirableUsageChecker(): UndesirableUsageChecker {
        return this.opts.undesirableUsageChecker;
    }

    public async findUndesirableUsages(workspaceId: string, hf: HasFingerprints): Promise<UndesirableUsage[]> {
        return _.flatten(await Promise.all(allFingerprints(hf).map(fp =>
            this.undesirableUsageChecker.check(workspaceId, fp))));
    }

    get idealStore(): IdealStore {
        return this.opts.idealStore;
    }

    constructor(private readonly opts: {
        idealStore: IdealStore,
        features: ManagedFeature[],
        undesirableUsageChecker: UndesirableUsageChecker,
    }) {
        opts.features.forEach(f => {
            if (!f) {
                throw new Error("A null feature was passed in");
            }
        });
    }
}

export function defaultedToDisplayableFingerprintName(feature?: ManagedFeature): (fingerprintName: string) => string {
    return (feature && feature.toDisplayableFingerprintName) || (name => name);
}

export function defaultedToDisplayableFingerprint(feature?: ManagedFeature): (fpi: FP) => string {
    return (feature && feature.toDisplayableFingerprint) || (fp => fp && fp.data);
}
