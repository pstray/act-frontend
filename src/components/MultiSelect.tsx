import {
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  Input,
  ListItemText,
  makeStyles,
  MenuItem,
  Select
} from '@material-ui/core';
import React from 'react';

const useStyles = makeStyles(() => ({
  root: {
    minWidth: '100px'
  },
  selectLabel: {
    alignItems: 'flex-start'
  }
}));

const MultiSelect = ({ id, label, values, selectedValues, onChange, emptyValue }: IMultiSelect) => {
  const classes = useStyles();

  return (
    <FormControl classes={{ root: classes.root }}>
      <FormControlLabel
        classes={{ root: classes.selectLabel }}
        label={label}
        labelPlacement="top"
        control={
          <Select
            multiple
            displayEmpty
            value={selectedValues}
            input={<Input id={id} />}
            renderValue={selected => {
              if ((selected as string[]).length === 0) {
                return <em>Show all</em>;
              }

              return (
                <div>
                  {(selected as string[]).map(s => (
                    <Chip key={s} size="small" label={s} />
                  ))}
                </div>
              );
            }}
            onChange={(event: React.ChangeEvent<{ value: unknown }>) => onChange(event.target.value)}>
            <MenuItem value={emptyValue}>
              <em>Show all</em>
            </MenuItem>
            {values.map((otf: string) => {
              return (
                <MenuItem key={otf} value={otf}>
                  <Checkbox checked={selectedValues.indexOf(otf) > -1} />
                  <ListItemText primary={otf} />
                </MenuItem>
              );
            })}
          </Select>
        }
      />
    </FormControl>
  );
};

export interface IMultiSelect {
  id: string;
  label: string;
  values: Array<string>;
  selectedValues: Array<string>;
  emptyValue: string;
  onChange: (x: any) => void;
}

export default MultiSelect;
