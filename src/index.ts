import {
  ConfigWithEnvKeys,
  MappedConfig,
  VerifiedConfig,
  MissingValue,
  VerifyParamCollection,
  MappedConfigElement,
  TransformTuple,
} from './types'
import {
  InsertValue,
  SecretKey,
  TransformValue,
} from './classes'
import {
  getResolvers
} from './config-resolvers'

const getMapConfigFunction = <T>({
  config,
  env,
  path = '',
}: VerifyParamCollection<T>) => <P extends keyof T>(
  key: P
): [MappedConfigElement<T[P]>, MissingValue[]] => {
  const value = config[key]
  const subPath = path.length === 0 ? `${key}` : `${path}.${key}`

  const {
    resolveSecret,
    resolveInsert,
    resolveTransformTuple,
    resolveTransformer,
    resolveEnvValue
  } = getResolvers<T, P>(env, subPath)

  if (value instanceof SecretKey) return resolveSecret(key, value)

  if (value instanceof InsertValue) return resolveInsert(key, value)

  if (value instanceof TransformValue) return resolveTransformer(key, value)
  if (Array.isArray(value)) return resolveTransformTuple(key, value as TransformTuple<unknown>)

  if (typeof value === 'string') return resolveEnvValue(key, value)

  const { errors, config: subConfig } = recursiveVerify({
    config: value as ConfigWithEnvKeys<T[P]>,
    env,
    path: subPath,
  })

  return [{ [key]: subConfig }, errors] as [MappedConfigElement<T[P]>, MissingValue[]]
}

const reduceConf = <T>(
  acc: { config: Partial<MappedConfig<T>>; errors: Error[] },
  [config, errors]: [Partial<MappedConfig<T>>, Error[]]
) => {
  return {
    config: {
      ...acc.config,
      ...config,
    },
    errors: acc.errors.concat(errors),
  }
}

const recursiveVerify = <T>(
  paramCollection: VerifyParamCollection<T>
): { config: MappedConfig<T>; errors: MissingValue[] } => {
  const mapConf = getMapConfigFunction(paramCollection)
  const mappedConf: [MappedConfig<T>, MissingValue[]] = Object.keys(
    paramCollection.config
  ).map(mapConf as any) as any

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
    env,
  })

  const missingValueMessages = errors.map(
    ({ envKey, path }) =>
      `environment value ${envKey} is missing from config object at ${path}`
  )

  return {
    config: builtConfig,
    missingValues: errors,
    missingValueMessages,
    errors: missingValueMessages,
  }
}

export function strictVerify<T>(
  config: T extends ConfigWithEnvKeys<T> ? T : never,
  env: { [key: string]: string | undefined } = process.env
): VerifiedConfig<T> {
  const { config: builtConfig, missingValueMessages } = verify(config, env)

  if (missingValueMessages.length > 0) {
    throw new Error(
      `Missing configuration values: ${missingValueMessages.join('\n')}`
    )
  }
  return builtConfig as VerifiedConfig<T>
}

export function insert<T>(value: T): InsertValue<T> {
  return new InsertValue(value)
}

export function secret(envKey: string) {
  return new SecretKey(envKey)
}

export function transform<T>(envKey: string, transformFunction: (envValue: string) => T) {
  return new TransformValue<T>(envKey, transformFunction)
}

export function transformFP<T>(transformFunction: (envValue: string) => T, envKey: string): TransformValue<T>
export function transformFP<T>(transformFunction: (envValue: string) => T): (envKey: string) => TransformValue<T>
export function transformFP<T>(transformFunction: (envValue: string) => T, envKey?: string) {
  if (envKey) return new TransformValue<T>(envKey, transformFunction)
  return (envKey_: string) => new TransformValue<T>(envKey_, transformFunction)
}


export {
  ConfigWithEnvKeys,
  MappedConfig,
  VerifiedConfig,
  MappedConfigElement,
  TransformTuple,
} from './types'

export {
  TransformValue,
  InsertValue,
  SecretKey,
  Secret
} from './classes'
