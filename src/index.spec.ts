import * as util from 'util'

import { verify, strictVerify, insert, TransformTuple, secret } from './index'

describe('env-verify', () => {
  describe('verify', () => {
    it('matches flat objects values to provided source keys', () => {
      const env = {
        DB_HOST: 'localhost:3000',
        DB_NAME: 'postgres',
      }
      const flatConfig = {
        dbHost: 'DB_HOST',
        dbName: 'DB_NAME',
      }
      const expected = {
        dbHost: 'localhost:3000',
        dbName: 'postgres',
      }
      const results = verify(flatConfig, env)

      expect(results.config).toEqual(expected)
    })

    it("matches nested object's values to provided env keys", () => {
      const env = {
        c: 'C',
        d: 'D',
        e: 'E',
      }
      const nestedConfig = {
        1: {
          2: {
            3: 'c',
          },
          4: 'd',
        },
        5: 'e',
      }
      const expected = {
        1: {
          2: {
            3: 'C',
          },
          4: 'D',
        },
        5: 'E',
      }
      const results = verify(nestedConfig, env)

      expect(results.config).toEqual(expected)
    })
    describe('with missing values', () => {
      const env = {
        PRESENT: 'present',
      }
      const config = {
        1: 'PRESENT',
        2: 'MISSING',
        3: {
          6: {
            7: 'MISSING',
          },
          4: 'MISSING',
          5: 'MISSING',
        },
      }
      const verifiedConfig = verify(config, env)

      it('should return an array of missing values', () => {
        const { missingValues } = verifiedConfig

        expect(missingValues.length).toEqual(4)
        expect(missingValues).toEqual(
          expect.arrayContaining([
            { envKey: 'MISSING', path: '2' },
            { envKey: 'MISSING', path: '3.6.7' },
            { envKey: 'MISSING', path: '3.4' },
            { envKey: 'MISSING', path: '3.4' },
            { envKey: 'MISSING', path: '3.5' },
          ])
        )
      })
      it('should return an array of missing value messages', () => {
        const { missingValueMessages } = verifiedConfig

        expect(missingValueMessages.length).toEqual(4)
        missingValueMessages.forEach((item) =>
          expect(typeof item === 'string').toBe(true)
        )
      })
    })
  })

  describe('with transform functions', () => {
    const env = {
      PRESENT: 'present',
    }
    it('allows a tuple with a string and transform function', () => {
      const configObj = {
        present: ['PRESENT', (envVal: string): any => envVal],
      }

      expect(() => verify(configObj, env)).not.toThrow()
    })

    it('allows the same tuple in a nested object', () => {
      const configObj = {
        nested: {
          present: ['PRESENT', (envVal: string) => envVal] as TransformTuple<
            string
          >,
        },
      }
      const result = verify<typeof configObj>(configObj, env).config

      expect(result.nested.present).toEqual(env.PRESENT)
    })

    it('runs the transform function and inserts the transformed value', () => {
      const transformed = ['hi', { there: ['this'] }, 'is', 'transformed']

      const configObj = {
        present: ['PRESENT', (_envVal: string) => transformed],
      }

      const { present: result } = verify(configObj, env).config

      expect(result).toEqual(transformed)
    })

    it('still returns an error if the env value is missing', () => {
      const configObj = {
        missing: ['MISSING', (envValue: string) => envValue],
      }

      const { missingValues } = verify(configObj, env)

      expect(missingValues.length).toEqual(1)
    })

    it('does not call the transform function if the env value is missing', () => {
      const transformFn = jest.fn()

      const configObj: any = {
        missing: ['MISSING', transformFn],
      }

      verify(configObj, env)

      expect(transformFn).not.toHaveBeenCalled()
    })
  })

  describe('strictVerify', () => {
    it('should throw an error on missing .env value', () => {
      const env = {
        a: 'A',
      }
      const config = {
        1: 'a',
        2: 'zz-top',
        3: {
          6: {
            7: 'IM_ALSO_MISSING',
          },
          4: 'IM_MISSING',
          5: 'ME_TOO',
        },
      }
      expect(() => strictVerify(config, env)).toThrowError()
    })

    it('should not throw an error when all .env values are present', () => {
      const env = {
        a: 'A',
        'zz-top': 'ZZ_TOP',
      }
      const config = {
        1: 'a',
        2: 'zz-top',
      }
      const expected = {
        1: 'A',
        2: 'ZZ_TOP',
      }

      expect(strictVerify(config, env)).toEqual(expected)
    })
  })

  describe('with insert()', () => {
    const env = {
      PRESENT: 'present',
    }
    it('does not error out when called with insert()', () => {
      const configObj = {
        nonEnvValue: insert('nonEnvValue'),
      }

      expect(() => verify(configObj, env)).not.toThrow()
    })

    it('inserts the given value into config object', () => {
      const configObj = {
        nonEnvValue: insert('nonEnvValue'),
      }

      const { nonEnvValue } = verify(configObj, env).config

      expect(nonEnvValue).toEqual('nonEnvValue')
    })

    it('inserts given value in nested config object', () => {
      const configObj = {
        a: {
          nonEnvValue: insert('nonEnvValue'),
        },
      }

      const { config } = verify<typeof configObj>(configObj, env)

      expect(config.a.nonEnvValue).toEqual('nonEnvValue')
    })
  })

  describe('with secret()', () => {
    const env = {
      PASSWORD: 'this is a password',
      NOT_PASSWORD: 'this is not a password',
    }

    it('allows the use of the secret function', () => {
      const configObj = {
        password: secret('PASSWORD'),
      }

      const result = verify(configObj, env)

      expect(result.config.password).not.toBeUndefined()
    })

    it('obscures secret when config object is coerced to string', () => {
      const configObj = {
        password: secret('PASSWORD'),
      }

      const result = verify(configObj, env).config

      expect(JSON.stringify(result).includes('[secret]')).toBe(true)
      expect(JSON.stringify(result).includes(env.PASSWORD)).toBe(false)
    })

    it('supports nested secrets', () => {
      const configObj = {
        hasAPassword: {
          password: secret('PASSWORD'),
        },
      }

      const result = verify(configObj, env).config

      expect(JSON.stringify(result).includes('[secret]')).toBe(true)
      expect(JSON.stringify(result).includes(env.PASSWORD)).toBe(false)
    })

    it('supports many secrets', () => {
      const configObj = {
        hasAPassword: {
          password: secret('PASSWORD'),
          password2: secret('PASSWORD'),
        },
        password: secret('PASSWORD'),
      }

      const result = verify(configObj, env).config

      expect(JSON.stringify(result).includes('[secret]')).toBe(true)
      expect(JSON.stringify(result).includes(env.PASSWORD)).toBe(false)
    })

    it('obfuscates secrets when using util.inspect (for nodejs)', () => {
      const configObj = {
        password: secret('PASSWORD'),
      }
      const { config } = verify(configObj, env)

      const result = util.inspect(config, false, 2)

      expect(result.includes(env.PASSWORD)).toBe(false)
      expect(result.includes('[secret]')).toBe(true)
    })
  })

  describe('integration of all features', () => {
    const env = {
      PRESENT: 'present',
      SECRET: 'somethingSecret',
    }

    const mixed = {
      present: 'PRESENT',
      transformed: ['PRESENT', (_value: string) => 'transformed'],
      inserted: insert('inserted'),
      secret: secret('SECRET'),
    }

    const configObj = {
      mixed,
      ...mixed,
    }

    const { config: result } = verify(configObj, env)

    it('mixes and matches features across nested config object', () => {
      const expected = expect.objectContaining({
        present: 'present',
        transformed: 'transformed',
        inserted: 'inserted',
        secret: '[secret]',
        mixed: {
          present: 'present',
          transformed: 'transformed',
          inserted: 'inserted',
          secret: '[secret]',
        },
      })

      expect(JSON.parse(JSON.stringify(result))).toEqual(expected)
    })

    it('hides all secrets', () => {
      expect(JSON.stringify(result).includes('somethingSecret')).not.toBe(true)
      expect(JSON.stringify(result).includes('[secret]')).toBe(true)
    })
  })
})
