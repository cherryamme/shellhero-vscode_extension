import * as vscode from "vscode";
import { settings } from "./config";
import {log} from "./logging";
interface Chunk {
  start: string;
  end: string;
  id: string;
}

export class RunShellCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private chunkConfig: Chunk[] = settings.chunkConfig;

  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    this.codeLenses = [];

    const text = document.getText();
    const lines = text.split(/\r?\n/);

    const startLines: Record<string, number> = {};
    const endLines: Record<string, number> = {};
    let title = "";
    const isStart: Record<string, boolean> = {};

    // Initialize isStart values for each chunk
    this.chunkConfig.forEach((chunk) => {
      isStart[chunk.id] = true;
      startLines[chunk.id] = -1;
      endLines[chunk.id] = -1;
    });
    
    lines.forEach((line, lineNumber) => {
      const chunkStart = this.chunkConfig.find((chunk) => line.match(new RegExp(`^\\s*${chunk.start}(\\s|$|(?!${chunk.start.charAt(chunk.start.length - 1)}))`)));
      const chunkEnd = this.chunkConfig.find((chunk) => line.match(new RegExp(`^\\s*${chunk.end}(\\s|$|(?!${chunk.end.charAt(chunk.end.length - 1)}))`)));


      if (chunkStart && isStart[chunkStart.id]) {
        startLines[chunkStart.id] = lineNumber;
        // Extract the first word after 'start'
        title = line.trimStart().split(/\s+/)[1] || "shellbook_run";
        isStart[chunkStart.id] = false;
      } else if (chunkEnd) {
        endLines[chunkEnd.id] = lineNumber;
        const codeChunkRanges: vscode.Range[] = [];
        if (startLines[chunkEnd.id] !== -1) {
          const range = new vscode.Range(startLines[chunkEnd.id], 0, endLines[chunkEnd.id], lines[endLines[chunkEnd.id]].length);
          const sendToTerminalCodeLens = new vscode.CodeLens(range, {
            title: 'Send to Terminal',
            command: 'shellbook.sendToTerminal',
            arguments: [document.uri, range]
          });
          // Send to qsub CodeLens
          const sendToQsubCodeLens = new vscode.CodeLens(range, {
            title: 'Send to qsub',
            command: 'shellbook.sendToQsub',

            arguments: [document.uri, range, title]
          });
          // iter_to_terminal CodeLens
          const iterToTerminalCodeLens = new vscode.CodeLens(range, {
            title: 'Iter to Terminal',
            command: 'shellbook.iterToTerminal',
            arguments: [document.uri, range, title]
          });
          // iter_file CodeLens
          const iterFileCodeLens = new vscode.CodeLens(range, {
            title: 'IterFile to Terminal',
            command: 'shellbook.iterFile',
            arguments: [document.uri, range, title]
          });
          // ...existing code...
          if (settings.sendToTerminal) {
            this.codeLenses.push(sendToTerminalCodeLens);
          }
          if (settings.sendToQsub) {
            this.codeLenses.push(sendToQsubCodeLens);
          }
          if (settings.iterToTerminal) {
            this.codeLenses.push(iterToTerminalCodeLens);
          }
          if (settings.iterFile) {
            this.codeLenses.push(iterFileCodeLens);
          }
          codeChunkRanges.push(new vscode.Range(startLines[chunkEnd.id], 0, endLines[chunkEnd.id], lines[endLines[chunkEnd.id]].length));

        }
        isStart[chunkEnd.id] = true;
      }
    });

    return this.codeLenses;
  }
}

const codeChunkDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: settings.chunkbackgroudcolor || "rgba(56, 56, 56, 0.3)",
  borderRadius: '0px',
  isWholeLine: true
});

export async function updateDecorations(editor: vscode.TextEditor | undefined,provider: RunShellCodeLensProvider) {
	if (editor && editor.document.languageId === 'shellscript') {
		vscode.commands.executeCommand('setContext', 'isShellScript', true);
		const codeChunks = await provider.provideCodeLenses(editor.document);

		const maxAttempts = 1;
		const attemptInterval = 1000; // 2000 milliseconds = 2 seconds
		const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (codeChunks) {
				const codeChunkRanges = codeChunks.map(chunk => chunk.range);
				editor.setDecorations(codeChunkDecorationType, codeChunkRanges);
				break;
			}
			await delay(attemptInterval);
		}
	}
}
