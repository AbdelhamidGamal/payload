import type { UpdateOne } from 'payload/database'

import type { ChainedMethods } from './find/chainMethods'
import type { PostgresAdapter } from './types'

import { chainMethods } from './find/chainMethods'
import buildQuery from './queries/buildQuery'
import { upsertRow } from './upsertRow'
import { getTableName } from './utilities/getTableName'

export const updateOne: UpdateOne = async function updateOne(
  this: PostgresAdapter,
  { id, collection: collectionSlug, data, draft, locale, req, where: whereArg },
) {
  const db = this.sessions[req.transactionID]?.db || this.drizzle
  const collection = this.payload.collections[collectionSlug].config
  const tableName = getTableName({ config: collection })
  const whereToUse = whereArg || { id: { equals: id } }

  const { joinAliases, joins, selectFields, where } = await buildQuery({
    adapter: this,
    fields: collection.fields,
    locale,
    tableName,
    where: whereToUse,
  })

  let idToUpdate = id

  // only fetch IDs when a sort or where query is used that needs to be done on join tables, otherwise these can be done directly on the table in findMany
  if (Object.keys(joins).length > 0 || joinAliases.length > 0) {
    const selectDistinctMethods: ChainedMethods = []

    if (where) {
      selectDistinctMethods.push({ args: [where], method: 'where' })
    }

    joinAliases.forEach(({ condition, table }) => {
      selectDistinctMethods.push({
        args: [table, condition],
        method: 'leftJoin',
      })
    })

    Object.entries(joins).forEach(([joinTable, condition]) => {
      if (joinTable) {
        selectDistinctMethods.push({
          args: [this.tables[joinTable], condition],
          method: 'leftJoin',
        })
      }
    })

    selectDistinctMethods.push({ args: [1], method: 'limit' })

    const selectDistinctResult = await chainMethods({
      methods: selectDistinctMethods,
      query: db.selectDistinct(selectFields).from(this.tables[tableName]),
    })

    if (selectDistinctResult?.[0]?.id) {
      idToUpdate = selectDistinctResult?.[0]?.id
    }
  }

  const result = await upsertRow({
    id: idToUpdate,
    adapter: this,
    data,
    db,
    fields: collection.fields,
    operation: 'update',
    req,
    tableName,
  })

  return result
}
