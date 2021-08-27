const core = require('@actions/core');
const github = require('@actions/github');

const validEvent = ['pull_request'];

function validateTitlePrefix(title, prefix, caseSensitive) {
    if (!caseSensitive) {
        prefix = prefix.toLowerCase();
        title = title.toLowerCase();
    }
    return title.startsWith(prefix);
}

function getValues(obj, key) {
    var objects = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        if (typeof obj[i] == 'object') {
            objects = objects.concat(getValues(obj[i], key));
        } else if (i == key) {
            objects.push(obj[i]);
        }
    }
    return objects;
}

function findCommonElement(array1, array2) {
    for (let i = 0; i < array1.length; i++) {
        for (let j = 0; j < array2.length; j++) {
            if (array1[i] === array2[j]) {
                return true;
            }
        }
    }

    return false;
}

async function run() {
    try {
        const authToken = core.getInput('github_token', { required: true })
        const eventName = github.context.eventName;
        core.info(`Event name: ${eventName}`);
        if (validEvent.indexOf(eventName) < 0) {
            core.setFailed(`Invalid event: ${eventName}`);
            return;
        }

        const owner = github.context.payload.pull_request.base.user.login;
        const repo = github.context.payload.pull_request.base.repo.name;

        const client = new github.GitHub(authToken);
        // The pull request info on the context isn't up to date. When
        // the user updates the title and re-runs the workflow, it would
        // be outdated. Therefore fetch the pull request via the REST API
        // to ensure we use the current title.
        const { data: pullRequest } = await client.pulls.get({
            owner,
            repo,
            pull_number: github.context.payload.pull_request.number
        });

        const title = pullRequest.title;

        core.info(`Pull Request title: "${title}"`);

        const actors = core.getInput('allowed_actors').split(',');
        const ignoreActors = getValues(github.context, 'login');
        core.info(`actors: ${actors}`);

        // Check if title skips check with actors
        if (actors.length > 0 && findCommonElement(actors, ignoreActors)) {
            core.info(`Ignoring Title Check for actors - ${actors}`);
            return
        }

        // Check if title pass regex
        const regex = RegExp(core.getInput('regex'));
        if (!regex.test(title)) {
            core.setFailed(`Pull Request title "${title}" failed to pass match regex - ${regex}`);
            return
        }

        // Check min length
        const minLen = parseInt(core.getInput('min_length'));
        if (title.length < minLen) {
            core.setFailed(`Pull Request title "${title}" is smaller than min length specified - ${minLen}`);
            return
        }

        // Check max length
        const maxLen = parseInt(core.getInput('max_length'));
        if (maxLen > 0 && title.length > maxLen) {
            core.setFailed(`Pull Request title "${title}" is greater than max length specified - ${maxLen}`);
            return
        }

        // Check if title starts with an allowed prefix
        let prefixes = core.getInput('allowed_prefixes');
        const prefixCaseSensitive = (core.getInput('prefix_case_sensitive') === 'true');
        core.info(`Allowed Prefixes: ${prefixes}`);
        if (prefixes.length > 0 && !prefixes.split(',').some((el) => validateTitlePrefix(title, el, prefixCaseSensitive))) {
            core.setFailed(`Pull Request title "${title}" did not match any of the prefixes - ${prefixes}`);
            return
        }

        // Check if title starts with a disallowed prefix
        prefixes = core.getInput('disallowed_prefixes');
        core.info(`Disallowed Prefixes: ${prefixes}`);
        if (prefixes.length > 0 && prefixes.split(',').some((el) => validateTitlePrefix(title, el, prefixCaseSensitive))) {
            core.setFailed(`Pull Request title "${title}" matched with a disallowed prefix - ${prefixes}`);
            return
        }

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
