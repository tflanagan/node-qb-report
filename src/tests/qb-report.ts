'use strict';

/* Dependencies */
import * as dotenv from 'dotenv';
import { serial as test } from 'ava';
import { QuickBase, QuickBaseOptions } from 'quickbase';
import { QBField } from 'qb-field';
import { QBRecord, QBRecordOptions } from 'qb-record';
import { QBReport } from '../qb-report';

/* Tests */
dotenv.config();

const QB_REALM = process.env.QB_REALM!;
const QB_USERTOKEN = process.env.QB_USERTOKEN!;
const QB_APPID = process.env.QB_APPID!;

const qbOptions: QuickBaseOptions = {
	server: 'api.quickbase.com',
	version: 'v1',

	realm: QB_REALM,
	userToken: QB_USERTOKEN,
	tempToken: '',

	userAgent: 'Testing',

	connectionLimit: 10,
	connectionLimitPeriod: 1000,
	errorOnConnectionLimit: false,

	proxy: false
};

const qb = new QuickBase(qbOptions);
const qbField = new QBField({
	quickbase: qb,
	dbid: '',
	fid: -1
});

const qbFieldOptions: QBRecordOptions = {
	quickbase: qb
};

const qbRecord = new QBRecord(qbFieldOptions);

let dbid: string = '',
	fid: number = -1,
	qbReport: QBReport;

test('QuickBase:createTable()', async (t) => {
	const results = await qb.createTable({
		appId: QB_APPID,
		name: 'Test Name'
	});

	qbField.setDBID(results.id);
	qbRecord.setDBID(results.id);

	dbid = qbRecord.getDBID();

	t.truthy(qbRecord.getDBID());
});

test('QBField:save() - create', async (t) => {
	qbField.set('fieldType', 'text');
	qbField.set('label', 'Test Field');

	const results = await qbField.save();

	fid = qbField.get('fid');
	qbRecord.setFid('test', fid);

	t.truthy(qbField.get('fid') > 0 && qbField.get('label') === 'Test Field' && results.label === 'Test Field');
});

test('QBRecord:save() - create', async (t) => {
	qbRecord.set('test', 'test value');

	const results = await qbRecord.save();

	t.truthy(qbRecord.get('recordid') === results.recordid && qbRecord.get('test') === 'test value');
});

test('loadSchema()', async (t) => {
	qbReport = new QBReport({
		quickbase: qb,
		dbid: dbid,
		reportId: 1,
		fids: {
			test: fid
		}
	});

	const results = await qbReport.loadSchema();

	t.truthy(results.name === qbReport.get('name'));
});

test('load()', async (t) => {
	const results = await qbReport.load();

	t.truthy(results.records[0].get('test') === 'test value');
});

test('QBRecord:delete()', async (t) => {
	const results = await qbRecord.delete();

	t.truthy(results.numberDeleted === 1);
});

test('QBField:delete()', async (t) => {
	const results = await qbField.delete();

	t.truthy(results.deletedFieldIds[0] === fid);
});

test('QuickBase:deleteTable()', async (t) => {
	const results = await qb.deleteTable({
		appId: QB_APPID,
		tableId: dbid
	});

	t.truthy(results.deletedTableId === dbid);
});
