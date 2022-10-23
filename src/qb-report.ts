'use strict';

/* Dependencies */
import merge from 'deepmerge';
import RFC4122 from 'rfc4122';
import {
	QuickBase,
	QuickBaseOptions,
	QuickBaseRequest,
	QuickBaseRequestRunReport,
	QuickBaseResponseGetReport,
	QuickBaseResponseRunQuery
} from 'quickbase';
import { QBField, QBFieldJSON } from 'qb-field';
import { QBFids, QBRecord, QBRecordData } from 'qb-record';

/* Globals */
const VERSION = require('../package.json').version;
const IS_BROWSER = typeof(window) !== 'undefined';
const rfc4122 = new RFC4122();

/* Main Class */
export class QBReport<
	RecordData extends QBRecordData = QBRecordData,
	CustomGetSet extends Object = Record<any, any>
> {

	public readonly CLASS_NAME = 'QBReport';
	static readonly CLASS_NAME = 'QBReport';

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
		reportId: ''
	};

	/**
	 * An internal id (guid) used for tracking/managing object instances
	 */
	public id: string;

	private _qb: QuickBase;
	private _tableId: string = '';
	private _fids: Record<any, number> = {};
	private _reportId: string = '';
	private _fields: QBField[] = [];
	private _records: QBRecord<RecordData>[] = [];
	private _data: Record<any, any> = {};

	constructor(options?: Partial<QBReportOptions<RecordData>>){
		this.id = rfc4122.v4();

		const {
			quickbase,
			...classOptions
		} = options || {};

		if(QuickBase.IsQuickBase(quickbase)){
			this._qb = quickbase;
		}else{
			this._qb = new QuickBase(merge.all([
				QBReport.defaults.quickbase,
				quickbase || {}
			]));
		}

		const settings = merge(QBReport.defaults, classOptions);

		this.setTableId(settings.tableId)
			.setFids(settings.fids as Record<any, number>)
			.setReportId(settings.reportId);

		return this;
	}

	private _buildRecord(record: Record<string, { value: any }>): QBRecord<RecordData> {
		const qbRecord = new QBRecord<RecordData>({
			quickbase: this._qb,
			tableId: this.getTableId(),
			fids: this.getFids()
		});
		const fields = this.getFields();

		qbRecord.setFields(fields);

		fields.forEach((field) => {
			const fid = field.getFid();
			const name = this.getFid(fid, true);
			let val;

			if(record[fid]){
				val = record[fid].value;
			}

			qbRecord.set('' + (name || fid), val);
		});

		return qbRecord;
	}

	clear(): this {
		this._fields = [];
		this._records = [];
		this._data = {};

		return this;
	}

	get(attribute: 'tableId'): string;
	get(attribute: 'reportId'): string;
	get<P extends keyof QuickBaseResponseGetReport>(attribute: P): QuickBaseResponseGetReport[P];
	get<P extends keyof CustomGetSet>(attribute: P): CustomGetSet[P];
	get<P extends string>(attribute: P): P extends keyof QuickBaseResponseGetReport ? QuickBaseResponseGetReport[P] : (P extends keyof CustomGetSet ? CustomGetSet[P] : any);
	get(attribute: any): any {
		if(attribute === 'tableId'){
			return this.getTableId();
		}else
		if(attribute === 'reportId'){
			return this.getReportId();
		}

		return this._data[attribute];
	}

	getFid<T extends keyof RecordData>(field: T): number;
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

			Object.entries(fids).some(([ name, fid ]) => {
				if(fid === field){
					id = name;

					return true;
				}

				return false;
			});
		}

		return id;
	}

	getFids(): QBFids<RecordData> {
		return this._fids as QBFids<RecordData>;
	}

	getField(id: number, returnIndex: true): number | undefined;
	getField(id: number, returnIndex?: false): QBField | undefined;
	getField(id: number, returnIndex: boolean = false): number | QBField | undefined {
		const fields = this.getFields();

		let result = undefined;

		for(let i = 0; result === undefined && i < fields.length; ++i){
			if(fields[i].getFid() === id){
				result = returnIndex ? i : fields[i];
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

	getRecord<T extends keyof RecordData>(value: RecordData[T], fieldName: T, returnIndex: true): number;
	getRecord<T extends keyof RecordData>(value: RecordData[T], fieldName: T, returnIndex?: false): QBRecord<RecordData> | undefined;
	getRecord(value: any, fieldName: string, returnIndex: true): number;
	getRecord(value: any, fieldName: string, returnIndex: false): QBRecord<RecordData> | undefined;
	getRecord(value: any, fieldName: string = 'recordid', returnIndex: boolean = false): QBRecord<RecordData> | number | undefined {
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

	getRecords(): QBRecord<RecordData>[] {
		return this._records;
	}

	getReportId(): string {
		return this._reportId;
	}

	getTableId(): string {
		return this._tableId;
	}

	async getTempToken({ requestOptions }: QuickBaseRequest = {}): Promise<void> {
		await this._qb.getTempTokenDBID({
			dbid: this.getTableId(),
			requestOptions
		});
	}

	async load({ requestOptions }: QuickBaseRequest = {}): Promise<QuickBaseResponseGetReport> {
		const results = await this._qb.getReport({
			tableId: this.getTableId(),
			reportId: this.getReportId(),
			requestOptions
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

			Object.entries(field).forEach(([ attribute, value ]) => {
				result!.set(attribute, value);
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

		return this._data as QuickBaseResponseGetReport;
	}

	async run({ skip, top, requestOptions }: QBReportRunRequest = {}): Promise<QBReportRunResponse<RecordData>>{
		const results = await this._qb.runReport({
			tableId: this.getTableId(),
			reportId: this.getReportId(),
			skip: skip,
			top: top,
			requestOptions
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

			Object.entries(field).forEach(([ attribute, value ]) => {
				result!.set(attribute, value);
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
			const nSets = Math.ceil(results.metadata.totalRecords / (results.metadata.top || 1));

			for(let i = 1; i < nSets; ++i){
				const resultSet = await this._qb.runReport({
					tableId: this.getTableId(),
					reportId: this.getReportId(),
					skip: (results.metadata.skip || 0) + (i * (results.metadata.skip || 0)),
					top: results.metadata.top || 1,
					requestOptions
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

	set(attribute: 'tableId', value: string): this;
	set(attribute: 'reportId', value: number): this;
	set<P extends keyof QuickBaseResponseGetReport>(attribute: P, value: QuickBaseResponseGetReport[P]): this;
	set<P extends keyof CustomGetSet>(attribute: P, value: CustomGetSet[P]): this;
	set<P extends string>(attribute: P, value: P extends keyof QuickBaseResponseGetReport ? QuickBaseResponseGetReport[P] : (P extends keyof CustomGetSet ? CustomGetSet[P] : any)): this;
	set(attribute: string | number, value: any): this {
		if(attribute === 'tableId'){
			return this.setTableId(value);
		}else
		if(attribute === 'reportId'){
			return this.setReportId(value);
		}

		this._data[attribute] = value;

		return this;
	}

	setTableId(tableId: string): this {
		this._tableId = tableId;

		return this;
	}

	setFid<T extends keyof RecordData>(name: T, id: number): this;
	setFid(name: string | number, id: number): this;
	setFid(name: string | number, fid: number): this {
		this._fids[name] = fid;

		return this;
	}

	setFids(fields: Record<any, number>): this {
		Object.entries(fields).forEach(([ name, fid ]) => {
			this.setFid(name, fid);
		});

		return this;
	}

	setReportId(reportId: string): this {
		this._reportId = reportId;

		return this;
	}

	/**
	 * Rebuild the QBRecord instance from serialized JSON
	 *
	 * @param json QBRecord serialized JSON
	 */
	fromJSON(json: string | QBReportJSON): this {
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
			Object.entries(json.data).forEach(([ name, value ]) => {
				this.set(name, value);
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

	/**
	 * Test if a variable is a `qb-report` object
	 * 
	 * @param obj A variable you'd like to test
	 */
	static IsQBReport<T extends QBRecordData = QBRecordData, K extends Object = Record<any, any>>(obj: any): obj is QBReport<T, K> {
		return ((obj || {}) as QBReport).CLASS_NAME === QBReport.CLASS_NAME;
	}

}

/* Interfaces */
export type QBReportJSON = {
	quickbase: QuickBaseOptions;
	tableId: string;
	fids: Record<any, number>;
	reportId: string;
	fields: QBFieldJSON[];
	data: Partial<QuickBaseResponseGetReport> & Record<any, any>;
}

export type QBReportOptions<RecordData extends QBRecordData = {}> = {
	quickbase: QuickBase | QuickBaseOptions;
	tableId: string;
	fids: Partial<QBFids<RecordData>>,
	reportId: string;
}

export type QBReportRunResponse<RecordData extends QBRecordData = {}> = Pick<QuickBaseResponseRunQuery, 'metadata'> & {
	records: QBRecord<RecordData>[];
	fields: QBField[];
};

export type QBReportRunRequest = Pick<QuickBaseRequestRunReport, 'top' | 'skip'> & QuickBaseRequest;

/* Export to Browser */
if(IS_BROWSER){
	window.QBReport = exports;
}

