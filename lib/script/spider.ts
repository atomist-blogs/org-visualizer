#!/usr/bin/env node
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

// tslint:disable

/**
 * Main entry point script. Added as a binary in package.json
 */

import {
    configureLogging,
    logger,
    PlainLogging,
} from "@atomist/automation-client";
import { loadUserConfiguration } from "@atomist/automation-client/lib/configuration";

import * as _ from "lodash";
import * as path from "path";
import * as yargs from "yargs";
import { SpiderAppOptions, spider } from "../analysis/offline/spider/spiderCall";
// Ensure we see console logging, and send info to the console
configureLogging(PlainLogging);

process.on('uncaughtException', function (err) {
    console.log(err);
    console.log(err.stack);
    process.exit(1);
});


yargs
    .option("owner", {
        required: false,
        alias: 'o',
        requiresArg: true,
        description: "GitHub user or organization",
    })
    .option("search", {
        required: false,
        alias: 's',
        requiresArg: true,
        description: "Search within repository names"
    }
    )
    .option("query", {
        required: false,
        alias: 'q',
        requiresArg: true,
        description: "GitHub query"
    }
    )
    .option("cloneUnder", {
        required: false,
        requiresArg: true,
        alias: 'c',
        description: "Full local directory path to clone under. Will keep clones around"
    }
    )
    .option("workspace", {
        required: false,
        requiresArg: true,
        alias: 'w',
        description: "Name of Atomist workspace to store results under"
    }
    )
    .option("localDirectory", {
        required: false,
        alias: "l",
        requiresArg: true,
        description: "local directory to search for repositories (instead of GitHub)",
    })
    .option("update", {
        type: "boolean",
        required: false,
        default: false,
        alias: "u",
        description: "always update existing analyses for same commit sha",
    })
    .strict()
    .usage("spider <GitHub criteria: supply owner or query>\nspider --localDirectory <directory containing repositories>");

const commandLineParameters = yargs.argv as any;
const owner = commandLineParameters.owner;
const search = commandLineParameters.search;
const query = commandLineParameters.query;
const cloneUnder = commandLineParameters.cloneUnder;
const workspaceId = commandLineParameters.workspace || "local";
const source: "local" | "GitHub" = commandLineParameters.localDirectory ? "local" : "GitHub";
const localDirectory = commandLineParameters.localDirectory ? path.resolve(commandLineParameters.localDirectory) : "";

if (!owner && !query && !localDirectory) {
    console.log(`Please specify owner, query, or local directory`);
    process.exit(1);
}
if (localDirectory) {
    console.log(`Spidering repositories under ${localDirectory}...`)
} else {
    if (search) {
        console.log(`Spidering GitHub repositories in organization ${owner} with '${search}' in the name...`);
    }
    if (query) {
        console.log(`Running GitHub query '${query}' for workspace '${workspaceId}'...`);
    } else {
        console.log(`Spidering GitHub organization ${owner} for workspace '${workspaceId}'...`);
    }
}

const params: SpiderAppOptions = {
    owner, search, query, workspaceId, source,
    cloneUnder,
    localDirectory, update: commandLineParameters.update
};

spider(params).then(r => {
    console.log(`Successfully analyzed ${JSON.stringify(params)}. result is `
        + JSON.stringify(r, null, 2));
}, err => {
    console.log("Failure: " + err.message);
});
