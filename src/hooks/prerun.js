import createDebug from 'debug'

const debug = createDebug('pd:prerun')

export default async function prerun(options) {
  debug('prerun: %s', options.Command?.id)
}
