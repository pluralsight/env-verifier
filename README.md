# env-verifier

Verify that your environment variables exist, and build up your config object at the same time!

[GitHub](https://github.com/pluralsight/env-verifier)

[NPM](https://npmjs.com/package/env-verifier)

## Package Purpose

Certain types of apps require the use of different variables depending on the environment that the app is run in.

The purpose of this package is to fail early whenever one of those values is missing from the environment object (ie: `process.env`).

Using this package properly will prevent the sometimes cryptic errors that occur when environment variables are missing.

Because every missing environment variable that `env-verifier` encountered is returned (or is displayed in a thrown error), this package can also help with the: `run the app, app crashes because of missing environment variable, add environment variable, repeat` loop that sometimes occurs.

## Getting Started

You probably have code that looks like this in your repo:

```javascript
module.exports = {
  database: {
    name: process.env.DB_NAME
    host: process.env.DB_HOST
    password: process.env.DB_PASSWORD
  },
  baseUrl: process.env.BASE_URL
}
```

to get up and running quickly with a verified config file, you can replace the above with something like this:

```javascript
const { strictVerify } = require('env-verifier')

//throws on one or more env misses
module.exports = strictVerify({
  database: {
    name: 'DB_NAME',
    host: 'DB_HOST',
    password: 'DB_PASSWORD'
  },
  baseUrl: 'BASE_URL'
})
```

This package exposes two verification functions - `verify` and `strictVerify`. Use `verify` (as seen below) when you want to handle reporting missing values, and `strictVerify` (as seen above) when you want, when any `env` misses are encountered, a descriptive error containing all `env` misses to be thrown.

Use example for `verify`:

```javascript
const { verify } = require('env-verifier')

const { config, missingValues } = verify({
  database: {
    name: 'DB_NAME'
    host: 'DB_HOST'
    password: 'DB_PASSWORD'
  },
  baseUrl: 'BASE_URL'
})

// do custom error logging, possibly throw your own errors
missingValues.forEach(
  ({ envKey, path }) => console.log(`missing env variable: ${envKey} from config at path: ${path}`)
)

module.exports = config
```

You can pass in your own `env` object as a parameter as long as its an object that is non-nested and has key value pairs with `undefined` or `string` as their value type.

---

## Usage Notes

 - [Function Parameters and Return Types](#function-parameters-and-return-types)
 - [Processing Missing Values](#processing-missing-values)
 - [Arbitrary Value Insertion](#arbitrary-value-insertion)
 - [Secret Insertion](#secret-insertion)
 - [Error Generation and Reporting](#error-generation-and-reporting)
 - [Variable Transformation (TransformTuple/Transform)](#variable-transformation)
 - [Dynamic Typings](#dynamic-typings)
 - [`env-verifier` vs `convict`](#vs-convict)

### Function Parameters and Return Types

#### `verify`

```typescript
export function insert<T>(value: T) => Insert<T> // see `Arbitrary Value Insertion` documentation

export function secret(envKey: string) => Secret // see `Secret Insertion` documentation

export function transform(envKey: string, transformFn: (envValue: string) => any) => Secret // see `TransformTuple/Transform` documentation

export type TransformTuple = [string, (envValue: string) => any]

// Type given as example only, the real type is a bit more complex
export type ConfigWithEnvKeys<T> = {
  [P in keyof T]: string | TransformTuple | ReturnType<typeof insert> | ReturnType<typeof secret> | ConfigWithEnvKeys<T[P]>
}

// Type given as example only, the real type is a bit more complex
export type MappedConfig<T> = {
  [P in keyof T]: string | null | ReturnType<typeof secret> | MappedConfig<T[P]> | any // ie: return type of `insert` or `TransformTuple` function
}

export type MissingValue = {
  path: string
  envKey: string
}

export function verify<T>(
  config: ConfigWithEnvKeys<T>
  env: { [key: string]: string | undefined } = process.env
): {
  config: MappedConfig<T>,
  missingValues: MissingValue[],
  missingValueMessages: string[],

  /**
   * @deprecated Please use missingValueMessages
  */
  errors: string[]
}
```

#### `strictVerify`

```typescript
export function insert<T extends any>(value: T) => Insert<T> // see `Arbitrary Value Insertion` documentation

export function secret(envKey: string) => Secret // see `Secret Insertion` documentation

export type TransformTuple = [string, (envValue: string) => any]

// Type given as example only, the real type is a bit more complex
export type ConfigWithEnvKeys<T> = {
  [P in keyof T]: string | TransformTuple | ReturnType<typeof insert> | ReturnType<typeof secret> | ConfigWithEnvKeys<T[P]>
}

// Type given as example only, the real type is a bit more complex
// Similar to MappedConfig<T>, but does not contain nulls (except for as returned by `TransformTuple` functions or `insert` calls)
export type VerifiedConfig<T> = {
  [P in keyof T]: string | ReturnType<typeof secret> | VerifiedConfig<T[P]> | any // ie: return type of `insert` or `TransformTuple` function
}

export function strictVerify<T>(
  config: ConfigWithEnvKeys<T>
  env: { [key: string]: string | undefined } = process.env
): VerifiedConfig<T>
```

 ### Processing Missing Values

An array of objects of type `MissingValue` is returned from the `verify` function.

```typescript
type MissingValue = {
  path: string
  envKey: string
}
```

#### `envKey`

The key of the missing `env` value.

#### `path`

The path in the `config` argument to the missing `env` variable.
Example:

```transcript
import { verify } from 'env-verifier'

const config = {
  db: {
    password: 'DB_PASSWORD'
  }
}

const env = {
  DB_PASSWORD: undefined
}

const result = verify(config, env)

console.log(result.missingValues)
// results in:
// [{ path: 'db.password', envKey: 'DB_PASSWORD' }]

```

### Arbitrary Value Insertion

You may have values that aren't present on your `env` object, but that you would like to live in your config object, this can be achieved by using the `insert()` function.

```javascript
const { verify, insert } = require('env-verifier')

module.exports = verify({
  appName: insert('my_app')
  ... // other env key names
}).config

//exports:
{
  appName: 'my_app'
  ... // other env values
}
```

### Secret Insertion

As of env-verifier version `1.2.0`, the obfuscation of env secrets is supported.

by wrapping the env key of the secret in the `secret` function exported by `env-verifier`, the secret will be retrieved and wrapped in a `Secret` object (see function specification above).

Note: support for transforming or inserting secrets is not supported at this time.

To retrieve the secret, the `reveal` function can be called.

What secret obfuscation will do:
 - protect secrets from casual logging of the produced config object
 - `JSON.stringify` of the config object will replace all secrets with the string `'[secret]'`

What secret obfuscation will not do:
- prevent the actually logging of the revealed secret
- mutate the actual string returned from the `env` object

```javascript
const { verify, secret } = require('env-verifier')

const env = {
  PASSWORD: 'superSecretPassword'
}

const { config } = verify({
  password: secret('PASSWORD')
  ... // other env key names
}, env)

module.exports = config

//exports:
{
  password: {
    reveal(): string
  }
  ... // other env values
}

config.password.reveal()
// returns:
'superSecretPassword'

console.log(config)
// prints: 
// {
     // if you're using nodejs:
//   password: [secret]
     // if you're using other JS environments:
//   password: Secret { reveal: [Function] }
//   ... other env values
// }

JSON.stringify(config)
// returns
// {
//   "password": "[secret]"
//   ... other env values
// }

```

### Error Generation and Reporting

Error reports are generated when an `env` variable is missing. An `env` variable is considered missing under the following circumstances:

 - `undefined` is returned from the `env` object.
 - an empty string, `''`, is returned from the `env` object. (useful for development with Docker)
 
 `verify` will always return an array of `MissingValue`s, which will be empty if there are no `env` misses.

`strictVerify` will evaluate the entire `config` object before throwing any errors in order to report all missing `env` variables

### Variable Transformation (TransformTuple/Transform)

Since `env-verifier` only takes environment key-value pair objects that have `strings` as the values, its sometimes necessary to transform those strings into something else (IE: transform the string `"true"` to a boolean `true`)

This can be done in two ways:

1. By passing in an array (called a `TransformTuple` in this context) containing the `env` variable name, and the function that you would like to use to transform the `env` variable value
1. By calling the `transform` function which takes the `env` variable name and the transformer function.

Here is an example for both:

```javascript
const config = {
  useNewFeature: ['USE_NEW_FEATURE', trueOrFalse => trueOrFalse === 'true'], // results a boolean
  serverHosts: ['SERVER_HOSTS', csvString => csvString.split(',')] // results in a string array
  ... //other env variables
}

module.exports = verify(config)
```

Transformation functions will not be run if its corresponding env value is missing.

### Dynamic Typings

**Important**: as of `v1.4.0`, `env-verifier` should now be able to correctly and dynamically infer the return types of both `verify` and `strictVerify` without any extra help. the below is only valid for versions that pre-date `v1.4.0`

`env-verifier` tries to give typescript typings for the config object that it returns, but needs a little help to get the correct types

If you are using TypeScript, you can do the following:

```typescript
const config: {
  a: 'A',
  b: insert([1, 2])
  c: {
    d: ['A', (envValue) => ([envValue])]
  }
}

const verifiedConfig = strictVerify(config)
// pre-v1.4.0 typings:
// typeof verifiedConfig = {
//   a: VerifiedConfig<unknown>
//   b: VerifiedConfig<unknown>
//   c: VerifiedConfig<unknown>
// }

// add typeof config object
const verifiedConfig = strictVerify<typeof config>(config)
// better typings:
// typeof verifiedConfig = {
//   a: string,
//   b: number[],
//   c: {
//     d: (string | (envVerify: any) => any)
//   }
// }

// cast TransformTuple types correctly
const config = {
  a: 'A',
  b: insert([1, 2])
  c: {
    d: ['A', (envValue) => ([envValue])] as TransformTuple<string>
  }
}

const verifiedConfig = strictVerify<typeof config>(config)
// best typings:
// typeof verifiedConfig = {
//   a: string,
//   b: number[],
//   c: {
//     d: string
//   }
// }
```

### `env-verifier` vs [`convict`](https://github.com/mozilla/node-convict)

Mozilla produces the excellent [`convict`](https://github.com/mozilla/node-convict) package that does most (if not all) of the same things that this package does. Here are a quick list of comparisons between the two:

|Feature|`env-verifier`|`convict`|
|-|-|-|
| Config Merging | ⚠️ | ✔️ |
| Nested Structures | ✔️ | ✔️ |
| Environmental Variables | ✔️ | ✔️ |
| Command-line arguments | ❌ | ✔️ |
| Validation | ✔️ | ✔️ |
| Secret Ofuscation | ✔️ | ✔️ |

Looking at that list, it seems like `convict` is the obvious choice, and in many cases it is, especially if your project is a large one with many different changing contributers.

However `env-verifier` excels in the following:

* Simplicity: Does one thing, and does it well
* Size: ~8kb packed, ~18kb unpacked, 4 source files total
* No production dependancies

## Prerequisites

This package is written in TypeScript@4.1.5 and is built/distributed for environments that support the majority of the es2016 specification.

This package also works best with projects that have centralized config files, IE: You map your `.env` variables to a `config` object in a file, and `import`/`require` that config object wherever you need `.env` values.

Other than that, just install the package and get going!

One of these:

```bash
npm install env-verifier
```

And one of these:

```javascript
const { verify, strictVerify } = require('env-verifier')
```

And you're all set.

## Testing

After you've ran `npm install`, just run `npm test`.

We use jest as our testing framework.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/pluralsight/env-verifier/tags).

## Authors

- **Snugbear** - *Initial work*

See also the list of [contributors](https://github.com/pluralsight/env-verifier/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
