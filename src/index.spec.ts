import {
  verify,
  strictVerify,
  ConfigWithEnvKeys,
  insert,
  secret
} from './index'

describe('env-verify', () => {
  describe('verify', () => {
    it('matches flat objects values to provided source keys', () => {
      const env = {
        DB_HOST: 'localhost:3000',
        DB_NAME: 'postgres'
      }
      const flatConfig = {
        dbHost: 'DB_HOST',
        dbName: 'DB_NAME'
      }
      const expected = {
        dbHost: 'localhost:3000',
        dbName: 'postgres'
      }
      const results = verify(flatConfig, env)

      expect(results.config).toEqual(expected)
    })

    it("matches nested object's values to provided env keys", () => {
      const env = {
        c: 'C',
        d: 'D',
        e: 'E'
      }
      const nestedConfig = {
        1: {
          2: {
            3: 'c'
          },
          4: 'd'
        },
        5: 'e'
      }
      const expected = {
        1: {
          2: {
            3: 'C'
          },
          4: 'D'
        },
        5: 'E'
      }
      const results = verify(nestedConfig, env)

      expect(results.config).toEqual(expected)
    })
    describe('with missing values', () => {
      it('should return an error string', () => {
        const env = {
          PRESENT: 'present'
        }
        const config = {
          1: 'PRESENT',
          2: 'MISSING',
          3: {
            6: {
              7: 'MISSING'
            },
            4: 'MISSING',
            5: 'MISSING'
          }
        }
        const result = verify(config, env).errors

        expect(result.length).toEqual(4)
      })
    })
  })

  describe('with transform functions', () => {
    const env = {
      PRESENT: 'present'
    }
    it('allows a tuple with a string and transform function', () => {
      const configObj: ConfigWithEnvKeys = {
        present: ['PRESENT', (envVal: string): any => envVal]
      }

      expect(() => verify(configObj, env)).not.toThrow()
    })

    it('allows the same tuple in a nested object', () => {
      const configObj: ConfigWithEnvKeys = {
        nested: {
          present: ['PRESENT', (envVal: string) => envVal]
        }
      }
      const result = verify(configObj, env).config

      expect(result.nested.present).toEqual(env.PRESENT)
    })

    it('runs the transform function and inserts the transformed value', () => {
      const transformed = ['hi', { there: ['this'] }, 'is', 'transformed']

      const configObj: ConfigWithEnvKeys = {
        present: ['PRESENT', (_envVal: string) => transformed]
      }

      const { present: result } = verify(configObj, env).config

      expect(result).toEqual(transformed)
    })

    it('still returns an error if the env value is missing', () => {
      const configObj: ConfigWithEnvKeys = {
        missing: ['MISSING', (envValue: string) => envValue]
      }

      const { errors } = verify(configObj, env)

      expect(errors.length).toEqual(1)
    })

    it('does not call the transform function if the env value is missing', () => {
      const transformFn = jest.fn()

      const configObj: any = {
        missing: ['MISSING', transformFn]
      }

      verify(configObj, env)

      expect(transformFn).not.toHaveBeenCalled()
    })
  })

  describe('strictVerfiy', () => {
    it('should throw an error on missing .env value', () => {
      const env = {
        a: 'A'
      }
      const config = {
        1: 'a',
        2: 'zz-top',
        3: {
          6: {
            7: 'IM_ALSO_MISSING'
          },
          4: 'IM_MISSING',
          5: 'ME_TOO'
        }
      }
      expect(() => strictVerify(config, env)).toThrowError()
    })

    it('should not throw an error when all .env values are present', () => {
      const env = {
        a: 'A',
        'zz-top': 'ZZ_TOP'
      }
      const config = {
        1: 'a',
        2: 'zz-top'
      }
      const expected = {
        1: 'A',
        2: 'ZZ_TOP'
      }

      expect(strictVerify(config, env)).toEqual(expected)
    })
  })

  describe('with insert()', () => {
    const env = {
      PRESENT: 'present'
    }
    it('does not error out when called with insert()', () => {
      const configObj = {
        nonEnvValue: insert('nonEnvValue')
      }

      expect(() => verify(configObj, env)).not.toThrow()
    })

    it('inserts the given value into config object', () => {
      const configObj = {
        nonEnvValue: insert('nonEnvValue')
      }

      const { nonEnvValue } = verify(configObj, env).config

      expect(nonEnvValue).toEqual('nonEnvValue')
    })

    it('inserts given value in nested config object', () => {
      const configObj = {
        a: {
          nonEnvValue: insert('nonEnvValue')
        }
      }

      const { config } = verify(configObj, env)

      expect(config.a.nonEnvValue).toEqual('nonEnvValue')
    })
  })

  describe('with secret()', () => {
    const env = {
      PASSWORD: 'this is a password',
      NOT_PASSWORD: 'this is not a password'
    }

    it('allows the use of the secret funciton', () => {
      const configObj = {
        password: secret('PASSWORD')
      }

      const result = verify(configObj, env)

      expect(result.config.password).not.toBeUndefined()
    })

    it('obscures secret when config object is coerced to string', () => {
      const configObj = {
        password: secret('PASSWORD')
      }

      const result = verify(configObj, env).config

      expect(JSON.stringify(result).includes('[secret]')).toBe(true)
      expect(JSON.stringify(result).includes(env.PASSWORD)).toBe(false)
    })

    it('supports nested secrets', () => {
      const configObj = {
        hasAPassword: {
          password: secret('PASSWORD')
        }
      }

      const result = verify(configObj, env).config

      expect(JSON.stringify(result).includes('[secret]')).toBe(true)
      expect(JSON.stringify(result).includes(env.PASSWORD)).toBe(false)
    })

    it('supports many secrets', () => {
      const configObj = {
        hasAPassword: {
          password: secret('PASSWORD'),
          password2: secret('PASSWORD')
        },
        password: secret('PASSWORD')
      }

      const result = verify(configObj, env).config

      console.log(result.toString())

      expect(JSON.stringify(result).includes('[secret]')).toBe(true)
      expect(JSON.stringify(result).includes(env.PASSWORD)).toBe(false)
    })
  })

  describe('integration of all features', () => {
    const env = {
      PRESENT: 'present',
      SECRET: 'secret'
    }

    const mixed: ConfigWithEnvKeys = {
      present: 'PRESENT',
      transformed: ['PRESENT', (_value: string) => 'transformed'],
      inserted: insert('inserted'),
      secret: secret('SECRET')
    }

    const configObj = {
      mixed,
      ...mixed
    }

    const { config: result } = verify(configObj, env)

    it('mixes and matches features across nested config object', () => {
      const expected = expect.objectContaining({
        present: 'present',
        transformed: 'transformed',
        inserted: 'inserted',
        secret: 'secret',
        mixed: {
          present: 'present',
          transformed: 'transformed',
          inserted: 'inserted',
          secret: 'secret'
        }
      })

      expect(result).toEqual(expected)
    })

    it('hides all secrets', () => {
      expect(JSON.stringify(result).includes('"secret"')).not.toBe(true)
      expect(JSON.stringify(result).includes('"[secret]"')).toBe(true)
    })
  })
})
