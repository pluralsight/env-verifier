export interface MappedConfig {
  [key: string]: any | string | undefined | MappedConfig
}

export interface TransformFn {
  (envValue: string): any
}

export type TransformTuple = [string, TransformFn]

export interface ConfigWithEnvKeys {
  [key: string]:
    | string
    | InsertValue
    | TransformTuple
    | SecretValue
    | ConfigWithEnvKeys
}

export interface NotASecretObject {
  [key: string]: string | InsertValue | TransformTuple | ConfigWithEnvKeys
}

interface VerifyParamCollection {
  config: ConfigWithEnvKeys
  env: { [key: string]: string | undefined }
  path?: string
}

export interface VerifiedConfig {
  [key: string]: any | string | VerifiedConfig
}

class InsertValue {
  value: any
  constructor(value: any) {
    this.value = value
  }
}

class SecretValue {
  secret: string
  constructor(secret: string) {
    this.secret = secret
  }
}

// const getSecretObject = (secret: string) => ({
//   get() {
//     return secret
//   },
//   toJSON() {
//     return '[secret]'
//   }
// })

const getEnvValueOrErrorCurried = (
  env: { [key: string]: string },
  subPath: string
) => (key: string): [string, Error[]] => {
  const envValue = env[key]
  if (envValue === undefined || envValue.length === 0) {
    const error = new Error(
      `environment value ${key} is missing from config object at ${subPath}`
    )
    return [undefined, [error]]
  }
  return [envValue, [] as Error[]]
}

const unwrapMaybeSecret = (
  maybeSecret: ConfigWithEnvKeys,
  path: string
): [NotASecretObject, string[]] => {
  if (maybeSecret instanceof SecretValue) {
    return [maybeSecret.secret as any, [path]]
  }

  return [maybeSecret as NotASecretObject, []]
}

const getMapConfigFunction = ({
  config,
  env,
  path = ''
}: VerifyParamCollection) => (
  key: string
): [ConfigWithEnvKeys, Error[], string[]] => {
  const maybeSecret = config[key]
  const subPath = path.length === 0 ? key : `${path}.${key}`

  const getEnvValueOrError = getEnvValueOrErrorCurried(env, subPath)

  const [value, secrets] = unwrapMaybeSecret(
    maybeSecret as ConfigWithEnvKeys,
    subPath
  )

  if (value instanceof InsertValue) {
    return [{ [key]: value.value }, [], secrets]
  }

  if (Array.isArray(value)) {
    const [envKey, transformFn] = (value as unknown) as TransformTuple
    const [envValue, errors] = getEnvValueOrError(envKey)

    const transforedValue = envValue && transformFn(envValue)

    return [{ [key]: transforedValue }, errors, secrets]
  }

  if (typeof value === 'string') {
    const [envValue, errors] = getEnvValueOrError(value as string)

    return [{ [key]: envValue }, errors, secrets]
  }

  const { errors, config: subConfig, secrets: subSecrets } = recursiveVerify({
    config: value,
    env,
    path: subPath
  })

  return [{ [key]: subConfig }, errors, subSecrets]
}

const reduceConf = (
  acc: { config: MappedConfig; errors: Error[]; secrets: string[] },
  [config, errors, secrets]: [MappedConfig, Error[], string[]]
) => {
  return {
    config: {
      ...acc.config,
      ...config
    },
    errors: acc.errors.concat(errors),
    secrets: acc.secrets.concat(secrets)
  }
}

const recursiveVerify = (
  paramCollection: VerifyParamCollection
): { config: ConfigWithEnvKeys; errors: Error[]; secrets: string[] } => {
  const mapConf = getMapConfigFunction(paramCollection)
  const mappedConf = Object.keys(paramCollection.config).map(mapConf)

  return mappedConf.reduce(reduceConf, { config: {}, errors: [], secrets: [] })
}

const seperateSecretsByNestLevel = (secrets: string[]) => {
  const nestedSecrets = secrets.filter(secret => secret.split('.').length > 1)
  const nonNested = secrets.filter(secret => !nestedSecrets.includes(secret))
  return [nonNested, nestedSecrets]
}

const seperateParentFromChildren = (path: string) => {
  return path.split(/\.(.+)/)
}

const recursiveToString = (
  secrets: string[],
  config: MappedConfig
): MappedConfig => {
  const [secretsAtThisLevel, deepSecrets] = seperateSecretsByNestLevel(secrets)
  const secretKeys = Object.keys(config).filter((configKey: string) =>
    secretsAtThisLevel.includes(configKey)
  )

  const groupedNestedSecrets = deepSecrets
    .map(seperateParentFromChildren)
    .reduce(
      (
        acc: { [key: string]: string[] },
        [parent, children]: [string, string]
      ): { [key: string]: string[] } => {
        return {
          ...acc,
          [parent]: acc[parent] ? acc[parent].concat(children) : [children]
        }
      },
      {} as { [key: string]: string[] }
    )

  const nestedSanatizedSecrets = Object.keys(groupedNestedSecrets).reduce(
    (acc: { [key: string]: MappedConfig }, parent: string) => {
      return {
        ...acc,
        [parent]: recursiveToString(
          groupedNestedSecrets[parent],
          config[parent]
        )
      }
    },
    {}
  )

  const sanatizedSecrets = secretKeys.reduce(
    (acc: { [key: string]: string }, key: string) => ({
      ...acc,
      [key]: '[secret]'
    }),
    {}
  )

  return { ...config, ...sanatizedSecrets, ...nestedSanatizedSecrets }
}

const toStringCurried = (
  secrets: string[],
  config: ConfigWithEnvKeys
) => (): string => {
  const sanatizedConfig = recursiveToString(
    secrets,
    JSON.parse(JSON.stringify(config))
  )

  return JSON.stringify(sanatizedConfig, null, 2)
}

export function verify(
  config: ConfigWithEnvKeys,
  env: { [key: string]: string | undefined } = process.env
): { config: MappedConfig; errors: string[] } {
  const { config: builtConfig, errors, secrets } = recursiveVerify({
    config,
    env
  })

  if (secrets.length) {
    const toString = toStringCurried(secrets, builtConfig)
    builtConfig.__proto__.toString = toString
  }

  const errorMessages = errors.map(
    ({ message }: { message: string }) => message
  )

  return { config: builtConfig, errors: errorMessages }
}

export function strictVerify(
  config: ConfigWithEnvKeys,
  env: { [key: string]: string | undefined } = process.env
): VerifiedConfig {
  const { config: builtConfig, errors } = verify(config, env)

  if (errors.length > 0) {
    throw new Error(`Missing configuration values: ${errors.join('\n')}`)
  }
  return builtConfig as VerifiedConfig
}

export function insert(value: any): InsertValue {
  return new InsertValue(value)
}

export function secret(value: any) {
  return new SecretValue(value)
}
