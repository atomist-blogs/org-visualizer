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

import { DefaultFeatureManager } from "../feature/DefaultFeatureManager";
import { chainUndesirableUsageCheckers, IdealStore } from "../feature/FeatureManager";
import { features } from "./features";

export function xfeatureManager(idealStore: IdealStore) {
    return new DefaultFeatureManager({
            idealStore: undefined,
            features,
            flags: chainUndesirableUsageCheckers(
                // async fp => {
                //     return (fp.name === "tsVersion" && (fp as TypeScriptVersion).typeScriptVersion.startsWith("2")) ?
                //         {
                //             severity: "warn",
                //             authority: "Rod",
                //             message: "Old TypeScript version",
                //         } :
                //         undefined;
                // },
                async fp => fp.name === "npm-project-dep::axios" ?
                    {
                        severity: "warn",
                        authority: "Christian",
                        message: "Don't use Axios",
                    } :
                    undefined,
                async fp => {
                    if (fp.name === "tslintproperty::rules:max-file-line-count") {
                        try {
                            const obj = JSON.parse(fp.data);
                            if (obj.options && obj.options.some(parseInt) > 500) {
                                return {
                                    severity: "warn",
                                    authority: "Rod",
                                    message: "Allow long files",
                                };
                            }
                        } catch {
                            // Do nothing
                        }
                    }
                    return undefined;
                }),
        },
    );
}
