'use strict';

/* Dependencies */
import merge from 'deepmerge';
import {
	QuickBase,
	QuickBaseOptions,
	QuickBaseResponseRunQuery,
	QuickBaseResponseField,
	reportType,
	QuickBaseRecord,
	QuickBaseResponseReport
} from 'quickbase';
import { QBField, QBFieldJSON } from 'qb-field';
import { QBRecord } from 'qb-record';

/* Globals */
const VERSION = require('../package.json').version;
const IS_BROWSER = typeof(window) !== 'undefined';

/* Main Class */
export class QBReport {

	/**
	 * The loaded library version
	 */
	static readonly VERSION: string = VERSION;

	/**
	 * The default settings of a `QuickBase` instance
	 */
	static defaults: QBReportOptions = {
		quickbase: {
			realm: IS_BROWSER ? window.location.host.split('.')[0] : ''
		},

		tableId: (() => {
			if(IS_BROWSER){
				const tableId = window.location.pathname.match(/^\/db\/(?!main)(.*)$/);

				if(tableId){
					return tableId[1];
				}
			}

			return '';
		})(),
		fids: {},
		reportId: -1
	};

	private _qb: QuickBase;
	private _tableId: string = '';
	private _fids: QBReportFids = {};
	private _reportId: number = -1;
	private _fields: QBField[] = [];
	private _records: QBRecord[] = [];
	private _data: Partial<QBReportData> = {};

	constructor(options?: Partial<QBReportOptions>){
		if(options){
			const {
				quickbase,
				...classOptions
			} = options || {};

			if(quickbase){
				// @ts-ignore
				if(quickbase && quickbase.CLASS_NAME === 'QuickBase'){
					this._qb = quickbase as QuickBase;
				}else{
					this._qb = new QuickBase(quickbase as QuickBaseOptions);
				}
			}else{
				this._qb = new QuickBase();
			}

			const settings = merge(QBReport.defaults, classOptions);

			this.setTableId(settings.tableId)
				.setFids(settings.fids)
				.setReportId(settings.reportId);
		}else{
			this._qb = new QuickBase();
		}

		return this;
	}

	private _buildRecord(record: QuickBaseRecord): QBRecord {
		const qbRecord = new QBRecord({
			quickbase: this._qb,
			tableId: this.getTableId(),
			fids: this.getFids()
		});
		const fields = this.getFields();

		//@ts-ignore
		qbRecord._fields = fields;

		fields.forEach((field) => {
			const fid = field.getFid();
			const name = this.getFid(fid, true);
			let val;

			if(record[fid]){
				val = record[fid].value;
			}

			qbRecord.set(name || fid, val);
		});

		return qbRecord;
	}

	clear(): QBReport {
		this._fields = [];
		this._records = [];
		this._data = {};

		return this;
	}

	get(field: 'tableId'): string;
	get(field: 'reportId'): number;
	get(field: string | number): any;
	get(field: string | number): any {
		if(field === 'tableId'){
			return this.getTableId();
		}else
		if(field === 'reportId'){
			return this.getReportId();
		}

		return (this._data as Indexable)[field];
	}

	getTableId(): string {
		return this._tableId;
	}

	getFid(field: number, byId?: true): string;
	getFid(field: string | number, byId?: false): number;
	getFid(field: string | number, byId: boolean = false): string | number {
		const fids = this.getFids();
		let id: string | number = -1;

		if(byId !== true){
			if(fids.hasOwnProperty(field)){
				id = fids[field];
			}
		}else{
			id = '';
			field = +field;

			getObjectKeys(fids).some((name) => {
				if(fids[name] === field){
					id = name;

					return true;
				}

				return false;
			});
		}

		return id;
	}

	getFids(): QBReportFids {
		return this._fids;
	}

	getField(id: number): QBField | undefined {
		const fields = this.getFields();

		let i = 0, result = undefined;

		for(; result === undefined && i < fields.length; ++i){
			if(fields[i].getFid() === id){
				result = fields[i];
			}
		}

		return result;
	}

	getFields(): QBField[] {
		return this._fields;
	}

	getFormulaFields(): QBField[] {
		return this.getFields().filter((field) => {
			return field.getFid() < 0;
		});
	}

	getNRecords(): number {
		return this._records.length;
	}

	getRecord(value: any, fieldName: string | number, returnIndex: true): number;
	getRecord(value: any, fieldName: string | number, returnIndex: false): QBRecord | undefined;
	getRecord(value: any, fieldName: string | number, returnIndex: boolean = false): QBRecord | number | undefined {
		const records = this.getRecords();
		let i = -1;

		records.some((record, o) => {
			if(record.get(fieldName) !== value){
				return false;
			}

			i = o;

			return true;
		});

		if(returnIndex){
			return i;
		}else
		if(i === -1){
			return undefined;
		}

		return records[i];
	}

	getRecords(): QBRecord[] {
		return this._records;
	}

	getReportId(): number {
		return this._reportId;
	}

	async load(options?: QBReportLoad): Promise<QBReportResponse>;
	async load(skip?: number | QBReportLoad, top?: number): Promise<QBReportResponse> {
		if(typeof(skip) === 'object'){
			top = skip.top;
			skip = skip.skip;
		}

		const results = await this._qb.runReport({
			tableId: this.getTableId(),
			reportId: this.getReportId(),
			options: {
				skip: skip,
				top: top
			}
		});

		results.fields.forEach((field) => {
			let result = this.getField(field.id);

			if(!result){
				result = new QBField({
					quickbase: this._qb,
					tableId: this.getTableId(),
					fid: field.id
				});

				this._fields.push(result);
			}

			getObjectKeys(field).forEach((attribute) => {
				result!.set(attribute, (field as Indexable)[attribute]);
			});
		});

		this.getFields().forEach((field) => {
			const fid = field.getFid();
			const name = this.getFid(fid, true);

			if(!name){
				this.setFid(fid, fid);
			}
		});

		if(skip === undefined && top === undefined){
			const nSets = Math.ceil(results.metadata.totalRecords / results.metadata.top);

			for(let i = 1; i < nSets; ++i){
				const resultSet = await this._qb.runReport({
					tableId: this.getTableId(),
					reportId: this.getReportId(),
					options: {
						skip: results.metadata.skip + (i * results.metadata.skip),
						top: results.metadata.top
					}
				});

				results.data = results.data.concat(resultSet.data);
				results.metadata.numRecords += resultSet.metadata.numRecords;
			}

			if(results.metadata.totalRecords !== results.metadata.numRecords){
				throw new Error('Race Condition Detected: Total records loaded does not match number of records expected');
			}

			results.metadata.skip = 0;
			results.metadata.top = results.metadata.numRecords;
		}

		this._records = results.data.map((record) => {
			return this._buildRecord(record);
		});

		return {
			metadata: results.metadata,
			fields: this.getFields(),
			records: this.getRecords()
		};
	}

	async loadSchema(): Promise<QBReportData> {
		const results = await this._qb.getReport({
			tableId: this.getTableId(),
			reportId: this.getReportId()
		});

		results.query.fields.forEach((field) => {
			let result = this.getField(field);

			if(!result){
				result = new QBField({
					quickbase: this._qb,
					tableId: this.getTableId(),
					fid: field
				});

				this._fields.push(result);
			}
		});

		results.query.formulaFields.forEach((field) => {
			let result = this.getField(field.id);

			if(!result){
				result = new QBField({
					quickbase: this._qb,
					tableId: this.getTableId(),
					fid: field.id
				});

				this._fields.push(result);
			}

			getObjectKeys(field).forEach((attribute) => {
				let value = (field as Indexable)[attribute];

				if(attribute === 'formula'){
					// @ts-ignore
					attribute = 'properties';

					value = {
						formula: value,
						...(result!.get('properties') || {})
					};
				}else
				if(attribute === 'decimalPrecision'){
					// @ts-ignore
					attribute = 'properties';

					value = {
						decimalPrecision: value,
						...(result!.get('properties') || {})
					};
				}

				result!.set(attribute as keyof QuickBaseResponseField, value);
			});
		});

		this.getFields().forEach((field) => {
			const fid = field.getFid();
			const name = this.getFid(fid, true);

			if(!name){
				this.setFid(fid, fid);
			}
		});

		this._data = {
			type: results.type,
			description: results.description,
			name: results.name,
			query: {
				...results.query,
				fields: this.getFields(),
				formulaFields: this.getFormulaFields()
			},
			properties: results.properties
		};

		return this._data as QBReportData;
	}

	set(attribute: 'tableId', value: string): QBReport;
	set(attribute: 'reportId', value: number): QBReport;
	set(attribute: string | number, value: any): QBReport;
	set(attribute: string | number, value: any): QBReport {
		if(attribute === 'tableId'){
			return this.setTableId(value);
		}else
		if(attribute === 'reportId'){
			return this.setReportId(value);
		}

		(this._data as Indexable)[attribute] = value;

		return this;
	}

	setTableId(tableId: string): QBReport {
		this._tableId = tableId;

		return this;
	}

	setFid(name: string | number, id: number): QBReport {
		if(typeof(id) === 'object'){
			this._fids[name] = id;

			getObjectKeys(id).forEach((key, i) => {
				this._fids[('' + name) + (i + 1)] = +id[key];
			});
		}else{
			this._fids[name] = +id;
		}

		return this;
	}

	setFids(fields: QBReportFids): QBReport {
		getObjectKeys(fields).forEach((name) => {
			this.setFid(name, fields[name]);
		});

		return this;
	}

	setReportId(reportId: number): QBReport {
		this._reportId = reportId;

		return this;
	}

	/**
	 * Rebuild the QBRecord instance from serialized JSON
	 *
	 * @param json QBRecord serialized JSON
	 */
	fromJSON(json: string | QBReportJSON): QBReport {
		if(typeof(json) === 'string'){
			json = JSON.parse(json);
		}

		if(typeof(json) !== 'object'){
			throw new TypeError('json argument must be type of object or a valid JSON string');
		}

		if(json.quickbase){
			this._qb = new QuickBase(json.quickbase);
		}

		if(json.tableId){
			this.setTableId(json.tableId);
		}

		if(json.fids){
			this.setFids(json.fids);
		}

		if(json.reportId){
			this.setReportId(json.reportId);
		}

		if(json.fields){
			json.fields.forEach((fieldJSON) => {
				this._fields.push(QBField.fromJSON(fieldJSON));
			});
		}

		if(json.data){
			getObjectKeys(json.data).forEach((name) => {
				// @ts-ignore
				this._data[name] = json.data[name];
			});
		}

		return this;
	}

	/**
	 * Serialize the QBReport instance into JSON
	 */
	toJSON(): QBReportJSON {
		return {
			quickbase: this._qb.toJSON(),
			tableId: this.getTableId(),
			fids: this.getFids(),
			reportId: this.getReportId(),
			fields: this.getFields().map((field) => {
				return field.toJSON();
			}),
			data: merge({}, this._data)
		};
	}

	/**
	 * Create a new QBReport instance from serialized JSON
	 *
	 * @param json QBReport serialized JSON
	 */
	static fromJSON(json: string | QBReportJSON): QBReport {
		if(typeof(json) === 'string'){
			json = JSON.parse(json);
		}

		if(typeof(json) !== 'object'){
			throw new TypeError('json argument must be type of object or a valid JSON string');
		}

		const newReport = new QBReport();

		return newReport.fromJSON(json);
	}

}

/* Helpers */
function getObjectKeys<O>(obj: O): (keyof O)[] {
    return Object.keys(obj) as (keyof O)[];
}

/* Interfaces */
interface Indexable {
	[index: string]: any;
}

export interface QBReportJSON {
	quickbase: QuickBaseOptions;
	tableId: string;
	fids: QBReportFids;
	reportId: number;
	fields: QBFieldJSON[];
	data: QBReportData;
}

export interface QBReportOptions {
	quickbase: QuickBase | QuickBaseOptions;
	tableId: string;
	fids: QBReportFids,
	reportId: number;
}

export interface QBReportLoad {
	skip?: number;
	top?: number;
}

export type QBReportResponse = Pick<QuickBaseResponseRunQuery, 'metadata'> & {
	records: QBRecord[];
	fields: QBField[];
};

export interface QBReportData {
	type: reportType;
	description: string;
	name: string;
	query: QuickBaseResponseReport['query'] | {
		fields: QBField[];
		formulaFields: QBField[];
	};
	properties: QuickBaseResponseReport['properties'];
}

export type QBReportFids = {
	[index in string | number]: number;
}

/* Export to Browser */
if(IS_BROWSER){
	// @ts-ignore
	window.QBRecord = QBRecord;
}

