import React from 'react';
import { compose, withProps } from 'recompose';
import { observable, action, decorate } from 'mobx';
import { observer } from 'mobx-react';
import Dialog from '@material-ui/core/Dialog';
// import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import RetractFactForm from './FormLogic';

const RetractFactDialog = ({ state: { open, close, fact, onSuccess } }) => (
  <Dialog
    open={open}
    onClose={close}
    disableBackdropClick
    disableEscapeKeyDown
    maxWidth='sm'
  >
    {/* <DialogTitle>Retract Fact</DialogTitle> */}
    <RetractFactForm
      {...{ close, fact, onSuccess }}
      ContentComp={DialogContent}
      ActionsComp={DialogActions}
    />
  </Dialog>
);

// State
class RetractFactStore {
  open = false;
  fact = null;

  retractFact = (fact, onSuccess = () => {}) => {
    this.open = true;
    this.fact = fact;
    this.onSuccess = onSuccess;
  };

  close = () => {
    this.open = false;
    // this.fact = null; // Keep to avoid flicker when closing the modal
  };
}

decorate(RetractFactStore, {
  open: observable,
  fact: observable,
  retractFact: action,
  close: action
});

const Singleton = new RetractFactStore();

export const { retractFact } = Singleton;
export default compose(withProps({ state: Singleton }), observer)(
  RetractFactDialog
);