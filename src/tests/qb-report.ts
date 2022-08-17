'use strict';

/* Dependencies */
import * as dotenv from 'dotenv';
import { serial as test } from 'ava';
import { QuickBase } from 'quickbase';
import { QBField } from 'qb-field';
import { QBRecord } from 'qb-record';
import { QBReport } from '../qb-report';

/* Tests */
dotenv.config();

const QB_REALM = process.env.QB_REALM!;
const QB_USERTOKEN = process.env.QB_USERTOKEN!;

const qb = new QuickBase({
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
});

const qbField = new QBField({
	quickbase: qb,
	tableId: '',
	fid: -1
});

const qbRecord = new QBRecord({
	quickbase: qb
});

let qbReport: QBReport;

let newAppId: string;
let newTableId: string;
let newFid: number;
let newRid: number;

test.after.always('deleteRecords()', async (t) => {
	if(!newRid){
		return t.pass();
	}

	const results = await qb.deleteRecords({
		tableId: newTableId,
		where: `{'3'.EX.'${newRid}'}`
	});

	t.truthy(results.numberDeleted);
});

test.after.always('deleteFields()', async (t) => {
	if(!newFid){
		return t.pass();
	}

	const results = await qb.deleteFields({
		tableId: newTableId,
		fieldIds: [ newFid ]
	});

	t.truthy(results.deletedFieldIds[0] === newFid);
});

test.after.always('deleteTable()', async (t) => {
	if(!newTableId){
		return t.pass();
	}

	const results = await qb.deleteTable({
		appId: newAppId,
		tableId: newTableId
	});

	t.truthy(results.deletedTableId === newTableId);
});

test.after.always('deleteApp()', async (t) => {
	if(!newAppId){
		return t.pass();
	}

	const results = await qb.deleteApp({
		appId: newAppId,
		name: 'Test Node Quick Base Application'
	});

	t.truthy(results.deletedAppId === newAppId);
});

test.before('QuickBase:createApp()', async (t) => {
	const results = await qb.createApp({
		name: 'Test Node Quick Base Application',
		assignToken: true
	});

	newAppId = results.id;

	t.truthy(newAppId && results.name === 'Test Node Quick Base Application');
});

test.before('QuickBase:createTable()', async (t) => {
	const results = await qb.createTable({
		appId: newAppId,
		name: 'Test Name'
	});

	qbField.setTableId(results.id);
	qbRecord.setTableId(results.id);

	newTableId = qbRecord.getTableId();

	t.truthy(qbRecord.getTableId());
});

test.before('QBField:save() - create', async (t) => {
	qbField.set('fieldType', 'text');
	qbField.set('label', 'Test Field');

	const results = await qbField.save();

	newFid = qbField.get('fid');
	qbRecord.setFid('test', newFid);

	t.truthy(qbField.get('fid') > 0 && qbField.get('label') === 'Test Field' && results.label === 'Test Field');
});

test.before('QBRecord:save() - create', async (t) => {
	qbRecord.set('test', 'test value');

	const results = await qbRecord.save();

	newRid = qbRecord.get('recordid');

	t.truthy(qbRecord.get('recordid') === results.recordid && qbRecord.get('test') === 'test value');
});

test('QuickBase instance match', async (t) => {
	qbReport = new QBReport({
		quickbase: qb,
		tableId: newTableId,
		reportId: 1,
		fids: {
			test: newFid
		}
	});

	// @ts-ignore
	return t.truthy(qb === qbField._qb && qb === qbRecord._qb && qb === qbReport._qb);
});

test('loadSchema()', async (t) => {
	const results = await qbReport.loadSchema();

	t.truthy(results.name === qbReport.get('name'));
});

test('load()', async (t) => {
	const results = await qbReport.load();

	t.truthy(results.records[0].get('test') === 'test value');
});
