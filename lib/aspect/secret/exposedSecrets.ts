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

import { Aspect, sha256 } from "@atomist/sdm-pack-fingerprint";
import {
    ExposedSecret,
    sniffProject,
} from "./secretSniffing";
import { loadSnifferOptions } from "./snifferOptionsLoader";

const ExposedSecretsType = "exposed-secret";

export type ExposedSecretsData = Pick<ExposedSecret, "secret" | "path" | "description">;

/**
 * Fingerprints the presence of exposed secrets, detected by
 * searching code for regular expressions.
 */
export const ExposedSecrets: Aspect<ExposedSecretsData> = {
    name: ExposedSecretsType,
    displayName: "Exposed secrets",
    baseOnly: true,
    extract: async p => {
        const exposedSecretsResult = await sniffProject(p, await loadSnifferOptions());
        return exposedSecretsResult.exposedSecrets.map(es => {
            const data = {
                secret: es.secret,
                path: es.path,
                description: es.description,
            };
            return {
                type: ExposedSecretsType,
                name: ExposedSecretsType,
                data,
                sha: sha256(JSON.stringify(data)),
            };
        });
    },
    toDisplayableFingerprintName: name => name,
    toDisplayableFingerprint: fp => `${fp.data.path}:${fp.data.description}`,
    stats: {
        defaultStatStatus: {
            entropy: false,
        },
    },
};
