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
  Aspect,
  ExtractFingerprint,
  FP,
  sha256,
} from "@atomist/sdm-pack-fingerprints";
import * as _ from "lodash";

export const NodeEngineType = "nodeEngine";

export interface EngineData {
  name: string;
  version: string;
}

/**
 * Construct an engine fingerprint from the given engine and its version
 * @param {string} name
 * @param {string} version
 * @return {FP}
 */
export function createEngineFingerprint(
  name: string,
  version: string,
): FP<EngineData> {
  const data = { name, version };
  return {
    type: NodeEngineType,
    name,
    abbreviation: "engines",
    version: "0.0.1",
    data,
    sha: sha256(JSON.stringify(data)),
  };
}

export const extractNodeEngine: ExtractFingerprint<EngineData> = async p => {
  const file = await p.getFile("package.json");

  if (file) {
    const jsonData = JSON.parse(await file.getContent());
    const engines = _.merge(jsonData.engines || {});

    const fingerprints: FP[] = [];

    for (const [name, version] of Object.entries(engines)) {
      fingerprints.push(createEngineFingerprint(name, version as string));
    }

    return fingerprints;
  } else {
    return undefined;
  }
};

/**
 * Find the engines defined in a package.json file
 * @constructor
 */
export const NodeEngine: Aspect<EngineData> = {
  name: NodeEngineType,
  displayName: "Node Engine",
  baseOnly: true,
  extract: extractNodeEngine,
  toDisplayableFingerprintName: name => name,
  toDisplayableFingerprint: fpi => {
    return fpi.data.version;
  },
};
