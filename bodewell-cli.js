#!/usr/bin/env node

const expand = require("expand-hash");
const npmls = require("npmls");
const figger = require("figger");
const bodewell = require("bodewell");

const DEFAULT_CONFIG = "/etc/bodewell/bodewell.config";

var args = process.argv.slice(1),
    script = args.shift(),
    service = bodewell(),
    confpath = DEFAULT_CONFIG,
    plugins = new Set(),
    m;

service.attachConsole(console);

while (args.length) switch ((arg = args.shift())) {
    case "--help":
        usage();
        process.exit(0);
        break;
    case "-v":
    case "--verbose":
        service.louder();
        break;
    case "-q":
    case "--quiet":
        service.quieter();
        break;
    case "-X":
    case "--debug":
        service.enableDebugging();
        break;
    case "-C":
    case "--config":
        if (!args.length) error(`${arg} missing argument`, 1);
        confpath = args.shift();
        break;
    case "-P":
    case "--plugin":
        if (!args.length) error(`${arg} missing argument`, 1);
        plugins.add(require(args.shift()));
        break;
    case "-L":
    case "--log":
        if (!args.length) error(`${arg} missing argument`, 1);
        service.attachLog(args.shift());
        break;
    default:
        if (/^-[vqX]/.test(arg)) {
            args.unshift(arg.substr(0,2), "-" + arg.substr(2));
        } else if (/^-[CPL]/.test(arg)) {
            args.unshift(arg.substr(0,2), arg.substr(2));
        } else if ((m = /^(--(?:config|plugin|logfile))=(.*)$/.exec(arg))) {
            args.unshift(m[1], m[2]);
        } else {
            error(`unrecognized option ${arg}`);
        }
}

npmls(true).filter(p => /^bodewell-plugin-.+/.test(p)).forEach(p => {
    plugins.add(require(p));
});

service.info("enabling plugins");
Array.from(plugins.values()).forEach(plugin => plugin(service));

figger(confpath)
    .catch(err => {
        if (err.code === "ENOENT") {
            service.warn(`could not find ${confpath}`);
            return {};
        } else {
            service.error(`could not load ${confpath}`);
            throw err;
        }
    })
    .then(expand)
    .then(defs => {
        service.info("setting up monitors");
        for (var key in defs.monitor) {
            service.monitor(key, defs.monitor[key]);
        }

        return true;
    })
    .catch(err => {
        error(debug ? err.stack : err.message, 2);
        return false;
    })
    .then(ok => {
        service.start();

        process.on("SIGINT", () => service.stop());
        process.on("SIGHUP", () => service.closeLog());
    });

function usage(exit) {
    console.log(`Usage: ${script} [-vqX] [--config=<path>] [--logfile=<path>] [--plugin=<pkg> ...]`);
    console.log(` -C --config=<path>  config path (default ${DEFAULT_CONFIG})`);
    console.log(` -X --debug          debug mode`);
    console.log(`    --help           show this help`);
    console.log(` -L --logfile=<path> write to log file`);
    console.log(` -P --plugin=<pkg>   load bodewell plugin`);
    console.log(` -q --quiet          show less output`);
    console.log(` -v --verbose        show more output`);
}

function error(message, exit) {
    console.error(message);
    process.exit(exit);
}
