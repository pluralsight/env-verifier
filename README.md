# env-verifier

Quickly verify that incoming variables from process.env aren't missing.

[GitHub](https://github.com/pluralsight/env-verifier)

[NPM](https://npmjs.com/package/env-verifier)

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

This package exposes two verification functions - `verify` and `strictVerify`. Use `verify` (as seen below) when you want to handle reporting missing values, and `strictVerify` (as seen above) when you want, when any `env` misses are encountered, us to throw a descriptive error containing all `env` misses.

Use example for `verify`:

```javascript
const { verify } = require('env-verifier')

const { config, errors } = verify({
  database: {
    name: 'DB_NAME'
    host: 'DB_HOST'
    password: 'DB_PASSWORD'
  },
  baseUrl: 'BASE_URL'
})

// do custom error logging, possibly throw your own errors
errors.forEach(console.error)

module.exports = config
```

You can pass in your own `env` object as a parameter as long as its an object that is non-nested and has key value pairs with `undefined` or `string` as their value type.

---

## Usage Notes

 - [Arbitrary Value Insertion](#arbitraryValueInsertion)
 - [Secret Insertion](#secretInsertion)
 - [Error Generation and Reporting](#errorGenerationAndReporting)
 - [Variable Transformation (TransformTuple)](#variableTransformation)
 - [Dynamic Typings](#dynamicTypings)

#### <a name="arbitraryValueInsertion"><a/> Arbitrary Value Insertion

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

#### <a name="secretInsertion"><a/> Secret Insertion

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

#### <a name="errorGenerationAndReporting"><a/> Error Generation and Reporting

Error reports are generated when an `env` variable is missing. An `env` variable is considered missing under the following circumstances:

 - `undefined` is returned from the `env` object.
 - an empty string, `''`, is returned from the `env` object.
 
 `verify` will always return the errors array, but it will be an empty array if there are no `env` misses.

`strictVerify` will not throw an error on the first encountered missing `env` value. Instead it will continue in order to report all missing `env` variables.

#### <a name="variableTransformation"><a/> Variable Transformation (TransformTuple)

Since process.env only returns strings, sometimes its necessary to transform those strings into something else (IE: transform the string `"true"` to a boolean `true`)

This can be done by passing in an array (TransformTuple) containing the `env` variable name, and the function that you would like to use to transform the `env` variable value like so:

```javascript
const config = {
  useNewFeature: ['USE_NEW_FEATURE', trueOrFalse => trueOrFalse === 'true'],
  ... //other env variables
}

verify(config)
```

Transformation functions will not be run if its corresponding env value is missing.

#### <a name="dynamicTypings"><a/> Dynamic Typings

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
// typings:
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

### Prerequisites

This package is written in TypeScript and is built/distributed for environments that support the majority of the es2016 specification.

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

Please read [CONTRIBUTING.md](CONSTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/pluralsight/env-verifier/tags).

## Authors

- **Snugbear** - *Initial work*

See also the list of [contributors](https://github.com/pluralsight/env-verifier/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
