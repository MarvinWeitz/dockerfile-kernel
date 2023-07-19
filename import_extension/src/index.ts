import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  ICommandPalette,
  InputDialog,
  showErrorMessage
} from '@jupyterlab/apputils';
import { URLExt } from '@jupyterlab/coreutils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ServerConnection } from '@jupyterlab/services';

import { UUID } from '@lumino/coreutils';

/**
 * Initialization data for the main menu example.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'import_extension:plugin',
  description: 'Minimal JupyterLab example adding a menu.',
  autoStart: true,
  requires: [ICommandPalette, IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    fileBrowser: IDefaultFileBrowser
  ) => {
    const { commands } = app;

    // Add a command
    const command = 'docker:import';
    commands.addCommand(command, {
      label: 'Open Dockerfile from Path…',
      caption: 'Open Dockerfile from path',
      execute: async args => {
        // Get Dockerfile path
        let path: string | undefined;
        if (args?.path) {
          path = args.path as string;
        } else {
          path =
            (
              await InputDialog.getText({
                label: 'Path',
                placeholder: '/path/relative/to/jlab/root',
                title: 'Open Dockerfile Path',
                okLabel: 'Open'
              })
            ).value ?? undefined;
        }
        if (!path) {
          return;
        }
        try {
          const trailingSlash = path !== '/' && path.endsWith('/');
          if (trailingSlash) {
            // The normal contents service errors on paths ending in slash
            path = path.slice(0, path.length - 1);
          }
          const { services } = fileBrowser.model.manager;
          const item = await services.contents.get(path, {
            content: false
          });
          if (trailingSlash && item.type !== 'directory') {
            throw new Error(`Path ${path}/ is not a directory`);
          }
          await commands.execute('filebrowser:go-to-path', {
            path,
            dontShowBrowser: args.dontShowBrowser
          });
          if (item.type === 'directory') {
            return;
          }
        } catch (reason: any) {
          if (reason.response && reason.response.status === 404) {
            reason.message = `Could not find path: %1 ${path}`;
          }
          return showErrorMessage('Cannot open', reason);
        }

        // Check path for dockerfile
        if (!path.toLowerCase().endsWith('dockerfile')) {
          return showErrorMessage(
            'Not a Dockerfile',
            "File must have extension 'Dockerfile'"
          );
        }

        // Read Dockerfile
        const response = await ServerConnection.makeRequest(
          URLExt.join(
            app.serviceManager.serverSettings.baseUrl,
            'api/contents',
            path
          ),
          {},
          app.serviceManager.serverSettings
        );
        const file = await response.json();

        let cells: string[] = [];
        const codeBlocks: string = file.content.split('\n#cellEnd');
        for (var block of codeBlocks) {
          let codeCells = block.split('#cellStart\n');
          for (var cell of codeCells) {
            // Cell is not multiline cell with empty lines
            if (cell.startsWith('\n') || cell.endsWith('\n')) {
              cells.push(...cell.split('\n\n').filter(cell => cell.length > 0));
            } else {
              // Cell can be an empty string if cellStart was the first or cellEnd the last line in the Dockerfile
              if (cell !== "")
                cells.push(cell);
            }
          }
        }

        // Create notebook json
        type Cell = {
          cell_type: string;
          execution_count: number | null;
          id: string;
          metadata: object;
          outputs: object[];
          source: string[];
        };
        type MetaData = {
          kernelspec: {
            display_name: string;
            language: string;
            name: string;
          };
          language_info: {
            file_extension: string;
            mimetype: string;
            name: string;
          };
        };
        type Content = {
          cells: Cell[];
          metadata: MetaData;
          nbformat: number;
          nbformat_minor: number;
        };

        let content: Content = {
          cells: [],
          metadata: {
            kernelspec: {
              display_name: 'Dockerfile',
              language: 'text',
              name: 'docker'
            },
            language_info: {
              file_extension: '.dockerfile',
              mimetype: 'text/x-dockerfile-config',
              name: 'docker'
            }
          },
          nbformat: 4,
          nbformat_minor: 5
        };

        const markdownComment = '#md ';
        const magicComment = '#mg ';
        for (var cell of cells) {
          let editedCell: string[] = [];
          let cellType = 'code';
          for (var line of cell.split('\n')) {
            if (line.startsWith(markdownComment)) {
              line = line.substring(markdownComment.length);
              cellType = 'markdown';
            } else if (line.startsWith(magicComment)) {
              line = line.substring(magicComment.length);
            }
            editedCell.push(line + '\n');
          }

          let lastLine = editedCell.pop();
          lastLine = lastLine?.substring(0, lastLine.length - 1);
          if (lastLine !== undefined) {
            editedCell.push(lastLine);
          }

          content.cells.push({
            cell_type: cellType,
            execution_count: null,
            id: UUID.uuid4(),
            metadata: {},
            outputs: [],
            source: editedCell
          });
        }

        // Write and open Jupyter Notebook
        path += '.ipynb';

        await app.serviceManager.contents.save(path, {
          type: 'file',
          format: 'text',
          content: JSON.stringify(content)
        });

        commands.execute('docmanager:open', {
          path: path
        });
      }
    });

    // Add the command to the command palette
    const category = 'Docker';
    palette.addItem({
      command,
      category,
      args: { origin: 'from the palette' }
    });
  }
};

export default plugin;
