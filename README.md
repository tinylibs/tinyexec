# tinyexec

> A minimal package for executing commands

This package was created to provide a minimal way of interacting with child
processes without having to manually deal with streams, piping, etc.

## Installing

```sh
$ npm i -S tinyexec
```

## Usage

A process can be spawned and awaited like so:

```ts
const result = await x('ls', ['-l']);

// result.stdout - the stdout as a string
// result.stderr - the stderr as a string
```

You may also iterate over the lines of output via an async loop:

```ts
const result = x('ls', ['-l']);

for await (const line of result) {
  // line will be from stderr/stdout in the order you'd see it in a term
}
```

### Piping to another process

You can pipe a process to another via the `pipe` method:

```ts
const proc1 = x('ls', ['-l']);
const proc2 = proc1.pipe('grep', ['.js']);
const result = await proc2;

console.log(result.stdout);
```

`pipe` takes the same options as a regular execution. For example, you can
pass a timeout to the pipe call:

```ts
proc1.pipe('grep', ['.js'], {
  timeout: 2000
});
```

### Killing a process

You can kill the process via the `kill` method:

```ts
const proc = x('ls');

proc.kill();

// or with a signal
proc.kill('SIGHUP');
```

### Node modules/binaries

By default, node's available binaries from `node_modules` will be accessible
in your command.

For example, in a repo which has `eslint` installed:

```ts
await x('eslint', ['.']);
```

In this example, `eslint` will come from the locally installed `node_modules`.

### Using an abort signal

An abort signal can be passed to a process in order to abort it at a later
time. This will result in the process being killed and `aborted` being set
to `true`.

```ts
const aborter = new AbortController();
const proc = x('node', ['./foo.mjs'], {
  signal: aborter.signal
});

// elsewhere...
aborter.abort();

await proc;

proc.aborted; // true
proc.killed; // true
```

## API

Calling `x(command[, args])` returns an awaitable `Result` which has the
following API methods and properties available:

### `pipe(command[, args[, options]])`

Pipes the current command to another. For example:

```ts
x('ls', ['-l'])
  .pipe('grep', ['js']);
```

### `process`

The underlying node `ChildProcess`. For example:

```ts
const proc = x('ls');

proc.process; // ChildProcess;
```

### `kill([signal])`

Kills the current process with the specified signal. By default, this will
use the `SIGTERM` signal.

For example:

```ts
const proc = x('ls');

proc.kill();
```

### `pid`

The current process ID. For example:

```ts
const proc = x('ls');

proc.pid; // number
```

### `aborted`

Whether the process has been aborted or not (via the `signal` originally
passed in the options object).

For example:

```ts
const proc = x('ls');

proc.aborted; // bool
```

### `killed`

Whether the process has been killed or not (e.g. via `kill()` or an abort
signal).

For example:

```ts
const proc = x('ls');

proc.killed; // bool
```

### `exitCode`

The exit code received when the process completed execution.

For example:

```ts
const proc = x('ls');

proc.exitCode; // number (e.g. 1)
```
