# Firestore to BigQuery export
An automatic tool for copying and converting [Cloud Firestore](https://firebase.google.com/docs/firestore/) data to [BigQuery](https://cloud.google.com/bigquery/docs/).

- Create a BigQuery dataset with tables corresponding to your Firestore collections.
- Table schemas are automatically generated based on your document property data types.
- Convert and copy your Firestore collections to BigQuery.

## Contents
  * [Installation](#installation)
  * [How to](#how-to)
    + [API](#api)
    + [Examples](#examples)
  * [Limitations](#limitations)
  * [Issues](#issues)

## Installation
- `npm i firestore-to-bigquery-export`

Then
* `import bigExport from 'firestore-to-bigquery-export'`

Or
* `const bigExport = require('firestore-to-bigquery-export')`

Then
```
const GCPSA = require('./Your-Service-Account-File.json')
bigExport.setBigQueryConfig(GCPSA)
bigExport.setFirebaseConfig(GCPSA)
bigExport.setBigQueryDataset(yourDatasetID || 'firestore')
```

## How to

### API
* `bigExport.setBigQueryConfig(serviceAccountFile:JSON)`
* `bigExport.setBigQueryDataset(datasetID:String)`
* `bigExport.setFirebaseConfig(serviceAccountFile:JSON)`
* `bigExport.createBigQueryTables(collectionNames:Array):Promise<Number>`
* `bigExport.copyCollectionsToBigQuery(collectionNames:Array):Promise<Number>`
* `bigExport.deleteBigQueryTables(tableNames:Array):Promise<Number>`


### Examples
```
/* Initialize BigQuery dataset named 'firestore' with four tables.
 * Table names equal collection names from Firestore.
 * Table schemas will be autogenerated.
 */

bigExport.createBigQueryTables[
    'payments',
    'profiles',
    'ratings',
    'users'
])
.then(res => {
    console.log(res)
})
.catch(error => {
    console.error(error)
})
```

Then, you can transport your data:
```
/* Copying and converting all documents in the given collections.
 * Inserting each document as a row in tables with the same name as the collection, in the dataset named 'firestore'.
 * Cells (document properties) that doesn't match the table schema will be rejected.
 */

bigExport.copyCollectionsToBigQuery([
    'payments',
    'profiles',
    'ratings',
    'users'
])
.then(res => {
    console.log(res)
})
.catch(error => {
    console.error(error)
})
```

After that, you may want to refresh your data. For the time being, the quick and dirty way is to delete your tables and make new ones:
```
// Deleting the given tables.

bigExport.deleteBigQueryTables([
    'payments',
    'profiles',
    'ratings',
    'users'
])
.then(res => {
    console.log(res)
})
.catch(error => {
    console.error(error)
})
```

## Limitations
* Your Firestore data model should be consistent. If a property of documents in the same collection have different data types, you'll get errors.
* Patching existing BigQuery sets isn't supported (yet). To refresh your datasets, you can `deleteBigQueryTables()`, then `createBigQueryTables()` and then `copyCollectionsToBigQuery()`.
* Changed your Firestore data model? Delete the corresponding BigQuery table and run `createBigQueryTables()` to create a table with a new schema.
* When running this package via a Cloud Function, you may experience that your function times out if your Firestore is large. You can then:
    * Increase the timeout for your Cloud Function in the [Google Cloud Platform Cloud Function Console](https://console.cloud.google.com/functions).
    * Run your function locally, using `firebase serve --only functions`. 

## Issues
Please use the [issue tracker](https://github.com/Johannes-Berggren/firestore-to-bigquery-export/issues).
