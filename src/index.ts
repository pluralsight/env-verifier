type Cast<X extends any, Y extends any> = X extends Y ? X : Y

type TransformTuple_<U extends any> = (string | ((_: string) => U))[] 

type MappedConfigElement_<E extends any> = 
  E extends any[] ? E extends TransformTuple_<infer R> ? R : never
  : E extends InsertValue<infer U> ? U
  : E extends SecretKey ? Secret
  : E extends string ? string | undefined
  : MappedConfig<E>

type MappedConfigElement<E extends any> = MappedConfigElement_<E> extends infer X ? Cast<X, any> : never


export type MappedConfig<T> = {
  [P in keyof T]: MappedConfigElement<T[P]>
}

export type TransformTuple<T> = [string, (_: string) => T]

export type ConfigWithEnvKeys<T> = {
  [P in keyof T]: T[P] extends InsertValue<infer U>
    ? InsertValue<U>
    : T[P] extends SecretKey
    ? SecretKey
    : T[P] extends string
    ? string
    : T[P] extends TransformTuple<infer U>
    ? TransformTuple<U>
    : T[P] extends ConfigWithEnvKeys<T[P]>
    ? ConfigWithEnvKeys<T[P]>
    : never
}

type MissingValue = {
  path: string
  envKey: string
}

interface VerifyParamCollection<T> {
  config: T extends ConfigWithEnvKeys<T> ? T : never
  env: { [key: string]: string | undefined }
  path?: string
}

export type VerifiedConfig<T> = {
  [P in keyof T]: T[P] extends SecretKey
    ? Secret
    : T[P] extends TransformTuple<infer U>
    ? U
    : T[P] extends InsertValue<infer U>
    ? U
    : T[P] extends string
    ? string
    : VerifiedConfig<T[P]>
}

export class InsertValue<T> {
  value: T
  constructor(value: T) {
    this.value = value
  }
}

export class SecretKey {
  secret: string
  constructor(secret: string) {
    this.secret = secret
  }
}

export class Secret {
  toJSON() {
    return '[secret]'
  }
  reveal: { (): string }

  constructor(secret: string) {
    this.reveal = () => secret
  }
}

const isNode = () =>
  typeof process === 'object' && process + '' === '[object process]'

const getSecretObject = (secret: string) => {
  const secretObj = new Secret(secret) as any

  if (isNode()) {
    const util = require('util')
    secretObj[util.inspect.custom] = () => '[secret]'
  }

  return secretObj as Secret
}

const getEnvValueOrErrorCurried = (
  env: { [key: string]: string },
  subPath: string
) => (key: string): [string, MissingValue[]] => {
  const envValue = env[key]
  if (envValue === undefined || envValue.length === 0) {
    const error: MissingValue = { envKey: key, path: subPath }
    return [undefined, [error]]
  }
  return [envValue, [] as MissingValue[]]
}

const getMapConfigFunction = <T>({
  config,
  env,
  path = ''
}: VerifyParamCollection<T>) => <P extends keyof T>(key: P): [MappedConfigElement<T[P]>, MissingValue[]] => {
  const value = config[key]
  const subPath = path.length === 0 ? key + '' : `${path}.${key}`

  const getEnvValueOrError = getEnvValueOrErrorCurried(env, subPath)

  if (value instanceof SecretKey) {
    const secretKey = value.secret
    const [secretValue, errors] = getEnvValueOrError(secretKey)
    return [
      { [key]: getSecretObject(secretValue) } as MappedConfigElement<T[P]>,
      errors
    ]
  }

  if (value instanceof InsertValue) {
    return [
      { [key]: value.value } as MappedConfigElement<T[P]>,
      []
    ]
  }

  if (Array.isArray(value)) {
    const [envKey, transformFn] = (value as any)
    const [envValue, errors] = getEnvValueOrError(envKey)

    const transformedValue = envValue && transformFn(envValue)

    return [
      { [key]: transformedValue } as MappedConfigElement<T[P]>,
      errors
    ]
  }

  if (typeof value === 'string') {
    const [envValue, errors] = getEnvValueOrError(value as string)

    return [
      { [key]: envValue } as MappedConfigElement<T[P]>,
      errors
    ]
  }

  const { errors, config: subConfig } = recursiveVerify({
    config: value as ConfigWithEnvKeys<T[P]>,
    env,
    path: subPath
  })

  return [
      { [key]: subConfig } as MappedConfigElement<T[P]>,
      errors
    ]
}

const reduceConf = <T>(
  acc: { config: Partial<MappedConfig<T>>; errors: Error[] },
  [config, errors]: [Partial<MappedConfig<T>>, Error[]]
) => {
  return {
    config: {
      ...acc.config,
      ...config
    },
    errors: acc.errors.concat(errors)
  }
}

const recursiveVerify = <T>(
  paramCollection: VerifyParamCollection<T>
): { config: MappedConfig<T>; errors: MissingValue[] } => {
  const mapConf = getMapConfigFunction(paramCollection)
  const mappedConf: [MappedConfig<T>, MissingValue[]] = Object.keys(paramCollection.config).map(mapConf as any) as any

  return mappedConf.reduce(reduceConf as any, { config: {}, errors: [] }) as any
}

export type VerifyReturnObject<T> = {
  config: MappedConfig<T>
  missingValues: MissingValue[]
  missingValueMessages: string[]
  /**
   * @deprecated please use missingValues or missingValueMessages instead.
   */
  errors: string[]
}

export function verify<T>(
  config: T extends ConfigWithEnvKeys<T> ? T : never,
  env: { [key: string]: string | undefined } = process.env
): VerifyReturnObject<T> {
  const { config: builtConfig, errors } = recursiveVerify({
    config,
    env
  })

  const missingValueMessages = errors.map(
    ({ envKey, path }) => `environment value ${envKey} is missing from config object at ${path}`
  )

  return { config: builtConfig, missingValues: errors, missingValueMessages, errors: missingValueMessages }
}

export function strictVerify<T>(
  config: T extends ConfigWithEnvKeys<T> ? T : never,
  env: { [key: string]: string | undefined } = process.env
): VerifiedConfig<T> {
  const { config: builtConfig, missingValueMessages } = verify(config, env)

  if (missingValueMessages.length > 0) {
    throw new Error(`Missing configuration values: ${missingValueMessages.join('\n')}`)
  }
  return builtConfig as VerifiedConfig<T>
}

export function insert<T>(value: T): InsertValue<T> {
  return new InsertValue(value)
}

export function secret(envKey: string) {
  return new SecretKey(envKey)
}
