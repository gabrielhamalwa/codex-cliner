import React from 'react';
import { Box, Text } from 'ink';

export interface SelectableRow {
    id: string;
    label: string;
    secondary?: string;
    selected?: boolean;
}

export function SelectableList(props: {
    title: string;
    rows: SelectableRow[];
    cursor: number;
    help: string[];
}): React.JSX.Element {
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
            <Text bold>{props.title}</Text>
            <Box flexDirection="column" marginTop={1}>
                {props.rows.length === 0 ? <Text color="gray">No items.</Text> : null}
                {props.rows.map((row, index) => (
                    <Text key={row.id} color={index === props.cursor ? 'green' : undefined}>
                        {index === props.cursor ? '>' : ' '} {row.selected ? '[x]' : '[ ]'}{' '}
                        {row.label}
                        {row.secondary ? <Text color="gray"> {row.secondary}</Text> : null}
                    </Text>
                ))}
            </Box>
            <Box marginTop={1} flexWrap="wrap">
                <Text color="gray">{props.help.join('  ')}</Text>
            </Box>
        </Box>
    );
}
