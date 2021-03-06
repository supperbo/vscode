/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { Handler } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import * as modes from 'vs/editor/common/modes';
import { createTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IStorageService, InMemoryStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ParameterHintsModel } from 'vs/editor/contrib/parameterHints/parameterHintsModel';

const mockFile = URI.parse('test:somefile.ttt');
const mockFileSelector = { scheme: 'test' };


const emptySigHelpResult = {
	signatures: [{
		label: 'none',
		parameters: []
	}],
	activeParameter: 0,
	activeSignature: 0
};
suite('ParameterHintsModel', () => {
	let disposables: IDisposable[] = [];

	setup(function () {
		disposables = dispose(disposables);
	});

	function createMockEditor(fileContents: string) {
		const textModel = TextModel.createFromString(fileContents, undefined, undefined, mockFile);
		const editor = createTestCodeEditor({
			model: textModel,
			serviceCollection: new ServiceCollection(
				[ITelemetryService, NullTelemetryService],
				[IStorageService, new InMemoryStorageService()]
			)
		});
		disposables.push(textModel);
		disposables.push(editor);
		return editor;
	}

	test('Provider should get trigger character on type', (done) => {
		const triggerChar = '(';

		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor));

		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext) {
				assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
				assert.strictEqual(context.triggerCharacter, triggerChar);
				done();
				return undefined;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});

	test('Provider should be retriggered if already active', (done) => {
		const triggerChar = '(';

		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Promise<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);
					assert.strictEqual(context.isRetrigger, false);
					assert.strictEqual(context.activeSignatureHelp, undefined);

					// Retrigger
					setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: triggerChar }), 50);
				} else {
					assert.strictEqual(invokeCount, 2);
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.strictEqual(context.isRetrigger, true);
					assert.strictEqual(context.triggerCharacter, triggerChar);
					assert.strictEqual(context.activeSignatureHelp, emptySigHelpResult);

					done();
				}
				return emptySigHelpResult;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});

	test('Provider should not be retriggered if previous help is canceled first', (done) => {
		const triggerChar = '(';

		const editor = createMockEditor('');
		const hintModel = new ParameterHintsModel(editor);
		disposables.push(hintModel);

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Promise<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);
					assert.strictEqual(context.isRetrigger, false);
					assert.strictEqual(context.activeSignatureHelp, undefined);

					// Cancel and retrigger
					hintModel.cancel();
					editor.trigger('keyboard', Handler.Type, { text: triggerChar });
				} else {
					assert.strictEqual(invokeCount, 2);
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);
					assert.strictEqual(context.isRetrigger, false);
					assert.strictEqual(context.activeSignatureHelp, undefined);
					done();
				}
				return emptySigHelpResult;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});

	test('Provider should get last trigger character when triggered multiple times and only be invoked once', (done) => {
		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor, 5));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = ['a', 'b', 'c'];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext) {
				++invokeCount;

				assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
				assert.strictEqual(context.isRetrigger, false);
				assert.strictEqual(context.triggerCharacter, 'c');

				// Give some time to allow for later triggers
				setTimeout(() => {
					assert.strictEqual(invokeCount, 1);

					done();
				}, 50);
				return undefined;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: 'a' });
		editor.trigger('keyboard', Handler.Type, { text: 'b' });
		editor.trigger('keyboard', Handler.Type, { text: 'c' });
	});

	test('Provider should be retriggered if already active', (done) => {
		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor, 5));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = ['a', 'b'];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Promise<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, 'a');

					// retrigger after delay for widget to show up
					setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: 'b' }), 50);
				} else if (invokeCount === 2) {
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.ok(context.isRetrigger);
					assert.strictEqual(context.triggerCharacter, 'b');
					done();
				} else {
					assert.fail('Unexpected invoke');
				}

				return emptySigHelpResult;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: 'a' });
	});

	test('Should cancel existing request when new request comes in', () => {
		const editor = createMockEditor('abc def');
		const hintsModel = new ParameterHintsModel(editor);

		let didRequestCancellationOf = -1;
		let invokeCount = 0;
		const longRunningProvider = new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [];
			signatureHelpRetriggerCharacters = [];


			provideSignatureHelp(_model: ITextModel, _position: Position, token: CancellationToken): modes.SignatureHelp | Promise<modes.SignatureHelp> {
				const count = invokeCount++;
				token.onCancellationRequested(() => { didRequestCancellationOf = count; });

				// retrigger on first request
				if (count === 0) {
					hintsModel.trigger({ triggerKind: modes.SignatureHelpTriggerKind.Invoke }, 0);
				}

				return new Promise<modes.SignatureHelp>(resolve => {
					setTimeout(() => {
						resolve({
							signatures: [{
								label: '' + count,
								parameters: []
							}],
							activeParameter: 0,
							activeSignature: 0
						});
					}, 100);
				});
			}
		};

		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, longRunningProvider));

		hintsModel.trigger({ triggerKind: modes.SignatureHelpTriggerKind.Invoke }, 0);
		assert.strictEqual(-1, didRequestCancellationOf);

		return new Promise((resolve, reject) =>
			hintsModel.onChangedHints(newParamterHints => {
				try {
					assert.strictEqual(0, didRequestCancellationOf);
					assert.strictEqual('1', newParamterHints!.signatures[0].label);
					resolve();
				} catch (e) {
					reject(e);
				}
			}));
	});

	test('Provider should be retriggered by retrigger character', (done) => {
		const triggerChar = 'a';
		const retriggerChar = 'b';

		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor, 5));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [retriggerChar];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Promise<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);

					// retrigger after delay for widget to show up
					setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: retriggerChar }), 50);
				} else if (invokeCount === 2) {
					assert.strictEqual(context.triggerKind, modes.SignatureHelpTriggerKind.TriggerCharacter);
					assert.ok(context.isRetrigger);
					assert.strictEqual(context.triggerCharacter, retriggerChar);
					done();
				} else {
					assert.fail('Unexpected invoke');
				}

				return emptySigHelpResult;
			}
		}));

		// This should not trigger anything
		editor.trigger('keyboard', Handler.Type, { text: retriggerChar });

		// But a trigger character should
		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});

	test('should use first result from multiple providers', async () => {
		const triggerChar = 'a';
		const firstProviderId = 'firstProvider';
		const secondProviderId = 'secondProvider';
		const paramterLabel = 'parameter';

		const editor = createMockEditor('');
		const model = new ParameterHintsModel(editor, 5);
		disposables.push(model);

		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			async provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): Promise<modes.SignatureHelp | undefined> {
				if (!context.isRetrigger) {
					// retrigger after delay for widget to show up
					setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: triggerChar }), 50);

					return {
						activeParameter: 0,
						activeSignature: 0,
						signatures: [{
							label: firstProviderId,
							parameters: [
								{ label: paramterLabel }
							]
						}]
					};
				}

				return undefined;
			}
		}));

		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			async provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): Promise<modes.SignatureHelp | undefined> {
				if (context.isRetrigger) {
					return {
						activeParameter: 0,
						activeSignature: context.activeSignatureHelp ? context.activeSignatureHelp.activeSignature + 1 : 0,
						signatures: [{
							label: secondProviderId,
							parameters: context.activeSignatureHelp ? context.activeSignatureHelp.signatures[0].parameters : []
						}]
					};
				}

				return undefined;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: triggerChar });

		const firstHint = await getNextHint(model);
		assert.strictEqual(firstHint!.signatures[0].label, firstProviderId);
		assert.strictEqual(firstHint!.activeSignature, 0);
		assert.strictEqual(firstHint!.signatures[0].parameters[0].label, paramterLabel);

		const secondHint = await getNextHint(model);
		assert.strictEqual(secondHint!.signatures[0].label, secondProviderId);
		assert.strictEqual(secondHint!.activeSignature, 1);
		assert.strictEqual(secondHint!.signatures[0].parameters[0].label, paramterLabel);
	});
});

function getNextHint(model: ParameterHintsModel) {
	return new Promise<modes.SignatureHelp | undefined>(resolve => {
		const sub = model.onChangedHints(e => {
			sub.dispose();
			return resolve(e);
		});
	});
}

