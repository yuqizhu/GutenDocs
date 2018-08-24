/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
/* eslint-enable */

const BodyFunctionDesc = ({ funcComment }) => `      ${funcComment.name}(`
  .concat(
    funcComment.tags.filter(tag => tag.title === 'param').map((tag, index, allParams) => {
      const param = [];
      if (tag.type.type === 'OptionalType') param.push(` [${tag.name}]`);
      else param.push(` ${tag.name}`);
      if (allParams.length === index + 1) param.push(' ');
      return param.join('');
    }),
  ).concat(')');

export default BodyFunctionDesc;

BodyFunctionDesc.propTypes = {
  /* eslint-disable-next-line */
  funcComment: PropTypes.object.isRequired,
};