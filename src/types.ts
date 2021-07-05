import {
  InsertValue,
  Secret,
  SecretKey,
  TransformValue
} from './classes'

type Cast<X extends any, Y extends any> = X extends Y ? X : Y

type TransformTuple_<U extends any> = (string | ((_: string) => U))[]

type MappedConfigElement_<E extends any> = E extends any[]
  ? E extends TransformTuple_<infer R>
    ? R
    : never
  : E extends TransformValue<infer R>
  ? R
  : E extends InsertValue<infer U>
  ? U
  : E extends SecretKey
  ? Secret
  : E extends string
  ? string | undefined
  : MappedConfig<E>

export type MappedConfigElement<E extends any> = MappedConfigElement_<
  E
> extends infer X
  ? Cast<X, any>
  : never

export type MappedConfig<T> = {
  [P in keyof T]: MappedConfigElement<T[P]>
}

export type TransformTuple<T> = [string, (_: string) => T]

export type Env = { [key: string]: string }

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

export type MissingValue = {
  path: string
  envKey: string
}

export interface VerifyParamCollection<T> {
  config: T extends ConfigWithEnvKeys<T> ? T : never
  env: { [key: string]: string | undefined }
  path?: string
}

export type VerifiedConfig<T> = {
  [P in keyof T]: T[P] extends SecretKey
    ? Secret
    : T[P] extends TransformTuple_<infer U>
    ? U
    : T[P] extends TransformValue<infer U>
    ? U
    : T[P] extends InsertValue<infer U>
    ? U
    : T[P] extends string
    ? string
    : VerifiedConfig<T[P]>
}
