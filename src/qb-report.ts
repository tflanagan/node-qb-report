'use strict';

/* Dependencies */
import merge from 'deepmerge';
import {
	QuickBase,
	QuickBaseOptions,
	QuickBaseResponseRunQuery,
	QuickBaseResponseField,
	reportType,
	QuickBaseGroupBy,
	QuickBaseSortBy
} from 'quickbase';
import { QBField } from 'qb-field';
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

		dbid: (() => {
			if(IS_BROWSER){
				const dbid = window.location.pathname.match(/^\/db\/(?!main)(.*)$/);

				if(dbid){
					return dbid[1];
				}
			}

			return '';
		})(),
		fids: {},
		reportId: -1
	};

	private _qb: QuickBase;
	private _dbid: string = '';
	private _fids: QBReportFids = {};
	private _reportId: number = -1;
	private _fields: QBField[] = [];
	private _records: QBRecord[] = [];
	private _data: any;

	constructor(options?: QBReportOptions){
		if(options){
			if(options.quickbase instanceof QuickBase){
				this._qb = options.quickbase;
			}else{
				this._qb = new QuickBase(options.quickbase);
			}

			delete options.quickbase;

			const settings = merge(QBRecord.defaults, options || {});

			this.setDBID(settings.dbid)
				.setFids(settings.fids)
				.setReportId(settings.reportId);
		}else{
			this._qb = new QuickBase();
		}

		return this;
	}

	get(field: string | number): any {
		if(!this._data.hasOwnProperty(field)){
			return null;
		}

		return (this._data as Indexable)[field];
	}

	getDBID(): string {
		return this._dbid;
	}

	getFid(field: string, byId?: false): number;
	getFid(field: number, byId?: true): string;
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

			Object.keys(fids).some((name) => {
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
			tableId: this.getDBID(),
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
					dbid: this.getDBID(),
					fid: field.id
				});

				this._fields.push(result);
			}

			getObjectKeys(field).forEach((attribute) => {
				result!.set(attribute, (field as Indexable)[attribute]);
			});
		});

		const fields = this.getFields();

		fields.forEach((field) => {
			const fid = field.getFid();
			const name = this.getFid(fid, true);

			if(!name){
				this.setFid(fid, fid);
			}
		});

		this._records = results.data.map((record) => {
			const qbRecord = new QBRecord({
				quickbase: this._qb,
				dbid: this.getDBID(),
				fids: this.getFids()
			});

			//@ts-ignore
			qbRecord._fields = fields;

			fields.forEach((field) => {
				const fid = field.getFid();
				const name = this.getFid(fid, true);

				qbRecord.set(name || fid, record[fid].value);
			});

			return qbRecord;
		});

		return {
			...results.metadata,
			fields: this.getFields(),
			records: this.getRecords()
		};
	}

	async loadSchema(): Promise<QBReportData> {
		const results = await this._qb.getReport({
			tableId: this.getDBID(),
			reportId: this.getReportId()
		});

		delete results.query.tableId;

		results.query.fields.forEach((field) => {
			let result = this.getField(field);

			if(!result){
				result = new QBField({
					quickbase: this._qb,
					dbid: this.getDBID(),
					fid: field
				});

				this._fields.push(result);
			}
		});

		delete results.query.fields;

		results.query.formulaFields.forEach((field) => {
			let result = this.getField(field.id);

			if(!result){
				result = new QBField({
					quickbase: this._qb,
					dbid: this.getDBID(),
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

		delete results.query.formulaFields;

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
			...results.properties,
			...results.query
		};

		return this._data;
	}

	setDBID(dbid: string): QBReport {
		this._dbid = dbid;

		return this;
	}

	setFid(name: string | number, id: number): QBReport {
		if(typeof(id) === 'object'){
			this._fids[name] = id;

			Object.keys(id).forEach((key, i) => {
				this._fids[('' + name) + (i + 1)] = +id[key];
			});
		}else{
			this._fids[name] = +id;
		}

		return this;
	}

	setFids(fields: QBReportFids): QBReport {
		Object.keys(fields).forEach((name) => {
			this.setFid(name, fields[name]);
		});

		return this;
	}

	setReportId(reportId: number): QBReport {
		this._reportId = reportId;

		return this;
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

export interface QBReportOptions {
	quickbase?: QuickBase | QuickBaseOptions;
	dbid?: string;
	fids?: QBReportFids,
	reportId?: number;
}

export interface QBReportLoad {
	skip?: number;
	top?: number;
}

export type QBReportResponse = QuickBaseResponseRunQuery['metadata'] & {
	records: QBRecord[];
	fields: QBField[];
};

export interface QBReportData {
	type?: reportType;
	description?: string;
	name?: string;
	filter?: string;
	formulaFields?: QuickBaseResponseField[];
	groupBy?: QuickBaseGroupBy[];
	sortBy?: QuickBaseSortBy[];
}

export type QBReportFids = {
	[index in string | number]: number;
}

/* Export to Browser */
if(IS_BROWSER){
	// @ts-ignore
	window.QBRecord = QBRecord;
}

