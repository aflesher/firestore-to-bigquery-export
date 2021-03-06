/*!
 * firestore-to-bigquery-export
 *
 * Copyright © 2019 Johannes Berggren <johannes@berggren.co>
 * MIT Licensed
 *
 */

'use strict'

/**
 * Module dependencies.
 *
 * @private
 */
let { BigQuery } = require('@google-cloud/bigquery'),
    bigQuery     = {},
    currentRow   = {},
    firebase     = require('firebase-admin'),
    firestore    = {}

/**
 * Connecting to the given Firebase project.
 *
 * @param {JSON} serviceAccountFile
 * @public
 */
exports.setFirebaseConfig = serviceAccountFile => {
  firestore = firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccountFile)
  }, 'firestore-to-bigquery-export-instance').firestore()
}

/**
 * Connecting to the given BigQuery project.
 *
 * @param {JSON} serviceAccountFile
 * @public
 */
exports.setBigQueryConfig = serviceAccountFile => {
  bigQuery = new BigQuery({
    projectId: serviceAccountFile.project_id,
    credentials: serviceAccountFile
  })
}

/**
 * Creating a BigQuery dataset with the given name if it doesn't already exist.
 * Running through each collection and checking if a table with the same name exists
 * in the bigQuery.dataset(datasetID).
 *
 * Creating the tables with the correct schema if the table doesn't already exist.
 *
 * @param {string} datasetID
 * @param {Array} collectionNames
 * @returns {Promise<Number>}
 * @public
 */
exports.createBigQueryTables = (datasetID, collectionNames) => {
  return verifyOrCreateDataset(datasetID)
    .then(() => {
      return bigQuery.dataset(datasetID).getTables()
    })
    .then(tables => {
      const existingTables = tables[0].map(table => table.id)

      return Promise.all(collectionNames.map(n => {
        if (!existingTables.includes(n)) {
          return createTableWithSchema(datasetID, n)
        }
        throw new Error('Table ' + n + ' already exists.')
      }))
    })
}

/**
 * Checking if a dataset with the given ID exists. Creating it if it doesn't.
 *
 * @param {string} datasetID
 * @returns {Promise<boolean||BigQuery.Dataset>}
 * @private
 */
function verifyOrCreateDataset (datasetID) {
  return bigQuery.dataset(datasetID).exists()
    .then(res => {
      return res[0] || bigQuery.createDataset(datasetID)
    })
    .catch(e => e)
}

/**
 * Runs through all documents in the given collection
 * to ensure all properties are added to the schema.
 *
 * Generating schema. Creating a table with the created schema in the given dataset.
 *
 * @param {string} datasetID
 * @param {string} collectionName
 * @returns {Promise<BigQuery.Table>}
 * @private
 */
function createTableWithSchema (datasetID, collectionName) {
  const index   = [],
        options = {
          schema: {
            fields: [
              {
                name: 'doc_ID',
                type: 'STRING',
                mode: 'REQUIRED'
              }
            ]
          }
        }

  return firestore.collection(collectionName).get()
    .then(documents => {
      console.log('Creating schema and table ' + collectionName + '.')

      documents.forEach(document => {
        document = document.data()

        Object.keys(document).forEach(propName => {
          const schemaField = getSchemaField(document[propName], propName)
          if (schemaField !== undefined && !index.includes(schemaField.name)) {
            options.schema.fields.push(schemaField)
            index.push(schemaField.name)
          }
        })
      })

      return bigQuery.dataset(datasetID).createTable(collectionName, options)
    })
    .catch(e => e)

  /**
   * Determines schema field properties based on the given document property.
   *
   * @param {string||number||Array||Object} val
   * @param {string} propName
   * @param {string} parent
   * @returns {Object||undefined}
   * @private
   */
  function getSchemaField (val, propName, parent) {
    const field = {
      name: parent ? parent + '__' + propName : propName,
      mode: '',
      type: ''
    }

    if (val === null) {
      field.type = 'STRING'
      field.mode = 'NULLABLE'
      return field
    }
    else if (typeof val === 'undefined') {
      field.type = 'STRING'
      field.mode = 'NULLABLE'
      return field
    }
    else if (typeof val === 'string') {
      field.type = 'STRING'
      field.mode = 'NULLABLE'
      return field
    }
    else if (typeof val === 'number') {
      Number.isInteger(val) ? field.type = 'INTEGER' : field.type = 'FLOAT'
      field.mode = 'NULLABLE'
      return field
    }
    else if (typeof val === 'boolean') {
      field.type = 'BOOL'
      field.mode = 'NULLABLE'
      return field
    }
    else if (Array.isArray(val)) {
      field.type = 'STRING'
      field.mode = 'NULLABLE'
      return field
    }
    else if (typeof val === 'object' && Object.keys(val).length) {
      Object.keys(val).forEach(subPropName => {
        const schemaField = getSchemaField(val[subPropName], subPropName, propName)
        if (schemaField !== undefined && !index.includes(schemaField.name)) {
          options.schema.fields.push(schemaField)
          index.push(schemaField.name)
        }
      })
      return undefined
    }
    else if (typeof val === 'object' && !Object.keys(val).length) {
      field.type = 'STRING'
      field.mode = 'NULLABLE'
      return field
    }
    else console.error(collectionName + '.' + propName + ' error! Type: ' + typeof val)
  }
}

/**
 * Iterate through the listed collections. Convert each document to a format suitable for BigQuery,
 * and insert them into a table corresponding to the collection name.
 *
 * @param {string} datasetID
 * @param {Array} collectionNames
 * @returns {Promise<Number>}
 * @public
 */
exports.copyCollectionsToBigQuery = (datasetID, collectionNames) => {
  return verifyOrCreateDataset(datasetID)
    .then(() => {
      return Promise.all(collectionNames.map(n => {
        return firestore.collection(n).get()
          .then(s => copyToBigQuery(datasetID, n, s))
      }))
    })
}

/**
 * @param {string} datasetID
 * @param {string} collectionName
 * @param {firebase.firestore.QuerySnapshot} snapshot
 * @returns {Promise<Object>}
 * @private
 */
function copyToBigQuery (datasetID, collectionName, snapshot) {
  console.log('Copying ' + collectionName + ' to dataset ' + datasetID + '.')

  return Promise.all(snapshot.docs.map(doc => {
    const docID = doc.id,
          data  = doc.data()

    currentRow = {}

    Object.keys(data).forEach(propName => {
      currentRow['doc_ID'] = docID
      const formattedProp = formatProp(data[propName], propName)
      if (formattedProp !== undefined) currentRow[formatName(propName)] = formattedProp
    })

    return bigQuery.dataset(datasetID).table(collectionName).insert(currentRow)
  }))
    .catch(e => e)
}

/**
 * Converting a given Firestore property to a format suitable for BigQuery.
 *
 * @param {string||number||Array||Object} val
 * @param {string} propName
 * @returns {string||number||Array||Object}
 * @private
 */
function formatProp (val, propName) {
  if (val === null) {
    return val
  }
  if (Array.isArray(val)) {
    let s = ''
    for (let i = 0; i < val.length; i++) {
      s += val[i] + (i < val.length - 1 ? ',' : '')
    }
    return s
  }
  else if (typeof val === 'object' && Object.keys(val).length) {
    Object.keys(val).forEach(subPropName => {
      const formattedProp = formatProp(val[subPropName], subPropName)
      if (formattedProp !== undefined) currentRow[formatName(subPropName, propName)] = formattedProp
    })
    return undefined
  }
  return val
}

/**
 * Formatting the property name to work with BigQuery.
 * Objects with child props are prefixed with the parent name.
 *
 * @param {string} propName
 * @param {string} [parent = undefined]
 * @returns {string}
 * @private
 */
function formatName (propName, parent) {
  parent = parent || undefined
  return parent ? parent + '__' + propName : propName
}

/**
 * Deletes all the given tables.
 *
 * @param {string} datasetID
 * @param {Array} tableNames
 * @returns {Promise<number>}
 * @public
 */
exports.deleteBigQueryTables = (datasetID, tableNames) => {
  return Promise.all(tableNames.map(n => {
    console.log('Deleting table ' + n + '.')
    return bigQuery.dataset(datasetID).table(n).delete()
  }))
}
