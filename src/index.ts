export interface MappedConfig {
  [key: string]:
    | any
    | string
    | undefined
    | MappedConfig
    | {
        [key: string]: {
          reveal(): string
        }
      }
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

const getSecretObject = (secret: string) => {
  const secretProto = {
    toJSON() {
      return '[secret]'
    },
    toString() {
      return '[secret]'
    }
  }

  const secretProperties = {
    reveal: {
      value: () => secret,
      writable: false,
      callable: true
    }
  }

  const secretObj = Object.create(secretProto, secretProperties)

  return secretObj
}

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

const getMapConfigFunction = ({
  config,
  env,
  path = ''
}: VerifyParamCollection) => (key: string): [MappedConfig, Error[]] => {
  const value = config[key]
  const subPath = path.length === 0 ? key : `${path}.${key}`

  const getEnvValueOrError = getEnvValueOrErrorCurried(env, subPath)

  if (value instanceof SecretValue) {
    const secretKey = value.secret
    const [secretValue, errors] = getEnvValueOrError(secretKey)
    return [{ [key]: getSecretObject(secretValue) }, errors]
  }

  if (value instanceof InsertValue) {
    return [{ [key]: value.value }, []]
  }

  if (Array.isArray(value)) {
    const [envKey, transformFn] = (value as unknown) as TransformTuple
    const [envValue, errors] = getEnvValueOrError(envKey)

    const transforedValue = envValue && transformFn(envValue)

    return [{ [key]: transforedValue }, errors]
  }

  if (typeof value === 'string') {
    const [envValue, errors] = getEnvValueOrError(value as string)

    return [{ [key]: envValue }, errors]
  }

  const { errors, config: subConfig } = recursiveVerify({
    config: value,
    env,
    path: subPath
  })

  return [{ [key]: subConfig }, errors]
}

const reduceConf = (
  acc: { config: MappedConfig; errors: Error[] },
  [config, errors]: [MappedConfig, Error[]]
) => {
  return {
    config: {
      ...acc.config,
      ...config
    },
    errors: acc.errors.concat(errors)
  }
}

const recursiveVerify = (
  paramCollection: VerifyParamCollection
): { config: ConfigWithEnvKeys; errors: Error[] } => {
  const mapConf = getMapConfigFunction(paramCollection)
  const mappedConf = Object.keys(paramCollection.config).map(mapConf)

  return mappedConf.reduce(reduceConf, { config: {}, errors: [] })
}

export function verify(
  config: ConfigWithEnvKeys,
  env: { [key: string]: string | undefined } = process.env
): { config: MappedConfig; errors: string[] } {
  const { config: builtConfig, errors } = recursiveVerify({
    config,
    env
  })

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
